import { Prisma, SavedItemType } from '@prisma/client';
import { db } from '@/lib/db';
import { createCollection, addItemToCollection } from './collections';

/** How many of the most recent, not-yet-collected items to consider clustering. */
const CANDIDATE_POOL_SIZE = 50;
/** Above `findRelatedItems`'s "loosely related" bar (0.5) — grouping into a collection is a stronger claim than just showing a related-items link. */
const CLUSTER_SIMILARITY_THRESHOLD = 0.6;
const MIN_CLUSTER_SIZE = 2;

export interface SimilarityPair {
  itemA: string;
  itemB: string;
  similarity: number;
}

/**
 * Union-find over pairs above the threshold — the simplest correct
 * clustering for personal-app-scale candidate pools (dozens of items, not
 * thousands), no external clustering library needed. Pure and DB-free so
 * it's directly unit-testable.
 */
export function clusterBySimilarity(
  itemIds: string[],
  pairs: SimilarityPair[],
  threshold = CLUSTER_SIMILARITY_THRESHOLD,
  minClusterSize = MIN_CLUSTER_SIZE,
): string[][] {
  const parent = new Map<string, string>(itemIds.map((id) => [id, id]));

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  for (const pair of pairs) {
    if (pair.similarity >= threshold) union(pair.itemA, pair.itemB);
  }

  const groups = new Map<string, string[]>();
  for (const id of itemIds) {
    const root = find(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }

  return Array.from(groups.values()).filter((group) => group.length >= minClusterSize);
}

/**
 * Names a cluster after a tag shared by more than half its members, since
 * that's a concrete, user-recognizable signal already attached to the
 * items — falls back to undefined (caller supplies a generic name) rather
 * than inventing a name with an LLM call, keeping this suggestion mechanism
 * to embedding similarity alone, no new AI-provider method required.
 */
export function deriveClusterName(memberTagLists: string[][]): string | undefined {
  const counts = new Map<string, number>();
  for (const tags of memberTagLists) {
    for (const tag of new Set(tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  let best: { tag: string; count: number } | undefined;
  for (const [tag, count] of counts) {
    if (!best || count > best.count) best = { tag, count };
  }

  if (best && best.count > memberTagLists.length / 2) {
    return best.tag.charAt(0).toUpperCase() + best.tag.slice(1);
  }
  return undefined;
}

export interface SuggestedCollection {
  name: string;
  itemIds: string[];
  items: Array<{ id: string; title: string; type: SavedItemType }>;
}

/**
 * Clusters the user's most recent not-yet-collected items by embedding
 * similarity and returns candidate collections — nothing is persisted here.
 * Mirrors the rest of the app's "AI suggests, user confirms" rule (Phase 5's
 * knowledge actions): call acceptSuggestedCollection to actually create one.
 */
export async function suggestCollections(userId: string): Promise<SuggestedCollection[]> {
  const candidates = await db.savedItem.findMany({
    where: { userId, collections: { none: {} } },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_POOL_SIZE,
    select: { id: true, title: true, type: true },
  });
  if (candidates.length < MIN_CLUSTER_SIZE) return [];

  const candidateIds = candidates.map((c) => c.id);
  const pairs = await db.$queryRaw<SimilarityPair[]>`
    SELECT e1."entityId" AS "itemA", e2."entityId" AS "itemB",
           1 - (e1.vector <=> e2.vector) AS similarity
    FROM embeddings e1
    JOIN embeddings e2
      ON e2."entityType" = 'SAVED_ITEM' AND e1."entityId" < e2."entityId"
    WHERE e1."entityType" = 'SAVED_ITEM'
      AND e1."entityId" IN (${Prisma.join(candidateIds)})
      AND e2."entityId" IN (${Prisma.join(candidateIds)})
  `;

  const clusters = clusterBySimilarity(candidateIds, pairs);
  if (clusters.length === 0) return [];

  const itemsById = new Map(candidates.map((c) => [c.id, c]));
  const tagRows = await db.savedItemTag.findMany({
    where: { savedItemId: { in: candidateIds } },
    include: { tag: true },
  });
  const tagsByItem = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByItem.get(row.savedItemId) ?? [];
    list.push(row.tag.name);
    tagsByItem.set(row.savedItemId, list);
  }

  return clusters.map((itemIds) => {
    const items = itemIds.map((id) => itemsById.get(id)!);
    const name = deriveClusterName(itemIds.map((id) => tagsByItem.get(id) ?? [])) ?? `${items.length} related saves`;
    return { name, itemIds, items };
  });
}

export interface AcceptSuggestedCollectionInput {
  name: string;
  emoji?: string;
  itemIds: string[];
}

/** Materializes a suggestion the user confirmed into a real, isAiSuggested Collection with its items assigned. */
export async function acceptSuggestedCollection(userId: string, input: AcceptSuggestedCollectionInput) {
  const collection = await createCollection(userId, { name: input.name, emoji: input.emoji, isAiSuggested: true });
  await Promise.all(input.itemIds.map((itemId) => addItemToCollection(userId, collection.id, itemId)));
  return collection;
}

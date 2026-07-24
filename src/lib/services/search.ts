import { Prisma, SavedItemType } from '@prisma/client';
import { db } from '@/lib/db';
import { getEmbeddingProvider } from '@/lib/embeddings';
import type { EmbeddingProvider } from '@/lib/embeddings/types';
import { toVectorLiteral } from './embedding-index';

const HIGHLIGHT_LENGTH = 300;
/** Suggestions below this cosine similarity are noise, not "related" — tunable heuristic. */
const MIN_RELATED_SIMILARITY = 0.5;

/** A blank query can't be embedded meaningfully — fail fast without spending an API call. */
export function hasSearchableQuery(q: string | undefined | null): boolean {
  return typeof q === 'string' && q.trim().length > 0;
}

/**
 * There's one embedding per saved item, not per chunk, so there's no
 * semantically-located span to point at — this is a readable preview, not a
 * token-level highlight. True passage highlighting needs chunk-level
 * embeddings (a bigger schema change, not made speculatively here).
 */
export function buildHighlight(summary: string | null, content: string | null): string {
  const source = summary?.trim() || content?.trim() || '';
  return source.length > HIGHLIGHT_LENGTH ? `${source.slice(0, HIGHLIGHT_LENGTH)}…` : source;
}

export interface SearchFilters {
  q: string;
  type?: SavedItemType;
  project?: string;
  tag?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface SearchResultItem {
  id: string;
  type: SavedItemType;
  title: string;
  summary: string | null;
  createdAt: Date;
  similarity: number;
  highlight: string;
}

export interface RelatedObjectResult {
  entityType: 'EXTRACTED_TASK' | 'DECISION' | 'QUESTION' | 'ENTITY';
  entityId: string;
  label: string;
  savedItemId: string;
  savedItemTitle: string;
  similarity: number;
}

export interface SearchResponse {
  items: SearchResultItem[];
  relatedObjects: RelatedObjectResult[];
}

interface SavedItemRow {
  id: string;
  type: SavedItemType;
  title: string;
  summary: string | null;
  content: string | null;
  createdAt: Date;
  similarity: number;
}

async function searchSavedItemEmbeddings(
  userId: string,
  vectorLiteral: string,
  filters: Pick<SearchFilters, 'type' | 'project' | 'tag' | 'from' | 'to' | 'limit'>,
): Promise<SavedItemRow[]> {
  const conditions: Prisma.Sql[] = [Prisma.sql`si."userId" = ${userId}`];

  if (filters.type) conditions.push(Prisma.sql`si.type = ${filters.type}::"SavedItemType"`);
  if (filters.from) conditions.push(Prisma.sql`si."createdAt" >= ${filters.from}`);
  if (filters.to) conditions.push(Prisma.sql`si."createdAt" <= ${filters.to}`);
  if (filters.tag) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM saved_item_tags sit JOIN tags tg ON tg.id = sit."tagId" WHERE sit."savedItemId" = si.id AND tg.name = ${filters.tag.toLowerCase()})`,
    );
  }
  if (filters.project) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM saved_item_projects sip JOIN projects p ON p.id = sip."projectId" WHERE sip."savedItemId" = si.id AND p.name = ${filters.project})`,
    );
  }

  const whereClause = Prisma.join(conditions, ' AND ');
  const limit = filters.limit ?? 25;

  return db.$queryRaw<SavedItemRow[]>`
    SELECT si.id, si.type, si.title, si.summary, si.content, si."createdAt",
           1 - (e.vector <=> ${vectorLiteral}::vector) AS similarity
    FROM embeddings e
    JOIN saved_items si ON si.id = e."entityId"
    WHERE e."entityType" = 'SAVED_ITEM' AND ${whereClause}
    ORDER BY e.vector <=> ${vectorLiteral}::vector ASC
    LIMIT ${limit}
  `;
}

async function searchRelatedObjectEmbeddings(
  userId: string,
  vectorLiteral: string,
  limit: number,
): Promise<RelatedObjectResult[]> {
  return db.$queryRaw<RelatedObjectResult[]>`
    SELECT * FROM (
      (SELECT 'EXTRACTED_TASK' AS "entityType", t.id AS "entityId", t.title AS label,
              t."savedItemId" AS "savedItemId", si.title AS "savedItemTitle",
              1 - (e.vector <=> ${vectorLiteral}::vector) AS similarity
       FROM embeddings e
       JOIN extracted_tasks t ON t.id = e."entityId"
       JOIN saved_items si ON si.id = t."savedItemId"
       WHERE e."entityType" = 'EXTRACTED_TASK' AND si."userId" = ${userId})
      UNION ALL
      (SELECT 'DECISION', d.id, d.statement, d."savedItemId", si.title,
              1 - (e.vector <=> ${vectorLiteral}::vector)
       FROM embeddings e
       JOIN decisions d ON d.id = e."entityId"
       JOIN saved_items si ON si.id = d."savedItemId"
       WHERE e."entityType" = 'DECISION' AND si."userId" = ${userId})
      UNION ALL
      (SELECT 'QUESTION', q.id, q.question, q."savedItemId", si.title,
              1 - (e.vector <=> ${vectorLiteral}::vector)
       FROM embeddings e
       JOIN questions q ON q.id = e."entityId"
       JOIN saved_items si ON si.id = q."savedItemId"
       WHERE e."entityType" = 'QUESTION' AND si."userId" = ${userId})
      UNION ALL
      (SELECT 'ENTITY', en.id, en.name, en."savedItemId", si.title,
              1 - (e.vector <=> ${vectorLiteral}::vector)
       FROM embeddings e
       JOIN extracted_entities en ON en.id = e."entityId"
       JOIN saved_items si ON si.id = en."savedItemId"
       WHERE e."entityType" = 'ENTITY' AND si."userId" = ${userId})
    ) combined
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
}

/**
 * Embeds the query and ranks saved items by cosine similarity, scoped to
 * userId and the given filters. Also returns a secondary list of related
 * extracted tasks/decisions/questions/entities matching the same query.
 */
export async function searchKnowledgeBase(
  userId: string,
  filters: SearchFilters,
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<SearchResponse> {
  if (!hasSearchableQuery(filters.q)) {
    return { items: [], relatedObjects: [] };
  }

  const queryVector = await provider.generateEmbedding(filters.q);
  const vectorLiteral = toVectorLiteral(queryVector);

  const [rows, relatedObjects] = await Promise.all([
    searchSavedItemEmbeddings(userId, vectorLiteral, filters),
    searchRelatedObjectEmbeddings(userId, vectorLiteral, filters.limit ?? 10),
  ]);

  const items: SearchResultItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    summary: row.summary,
    createdAt: row.createdAt,
    similarity: row.similarity,
    highlight: buildHighlight(row.summary, row.content),
  }));

  return { items, relatedObjects };
}

export interface RelatedItemResult {
  id: string;
  type: SavedItemType;
  title: string;
  summary: string | null;
  similarity: number;
}

/**
 * Finds saved items similar to an already-embedded one, using its own stored
 * vector as the query — no embedding API call needed. This is what powers
 * both "Related Items" on the item detail page and the save-time suggestion
 * example ("You previously saved: ..."). It's also the concrete
 * implementation of the AIProvider.findRelationships() gap flagged as
 * unwired back in Phase 2 — embedding similarity gives the same answer
 * without an LLM call per comparison.
 */
export async function findRelatedItems(
  userId: string,
  savedItemId: string,
  limit = 5,
): Promise<RelatedItemResult[]> {
  return db.$queryRaw<RelatedItemResult[]>`
    WITH target AS (
      SELECT vector FROM embeddings WHERE "entityType" = 'SAVED_ITEM' AND "entityId" = ${savedItemId}
    )
    SELECT si.id, si.type, si.title, si.summary,
           1 - (e.vector <=> target.vector) AS similarity
    FROM embeddings e
    JOIN saved_items si ON si.id = e."entityId"
    CROSS JOIN target
    WHERE e."entityType" = 'SAVED_ITEM'
      AND si."userId" = ${userId}
      AND e."entityId" != ${savedItemId}
      AND 1 - (e.vector <=> target.vector) > ${MIN_RELATED_SIMILARITY}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
}

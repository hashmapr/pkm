import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createSavedItem } from '../saved-items';
import { indexSavedItemEmbeddings } from '../embedding-index';
import { getForgottenItems, getRecentlySaved, getRelatedDiscoveries } from '../rediscovery';
import { acceptSuggestedCollection, suggestCollections } from '../collection-suggestions';
import type { EmbeddingProvider } from '@/lib/embeddings/types';

/**
 * Needs a real database (pgvector) — skips cleanly if none is reachable, same
 * pattern as the other integration tests in this suite. Uses the same
 * deterministic hashed bag-of-words fake embedding as search.integration.test.ts
 * to exercise real cosine-similarity queries without a live embedding model.
 */
let dbAvailable = true;
try {
  await db.$queryRaw`SELECT 1`;
} catch {
  dbAvailable = false;
}

const DIMENSIONS = 1536;

function hashEmbedding(text: string): number[] {
  const vector = new Array(DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
    vector[hash % DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

function fakeEmbeddingProvider(): EmbeddingProvider {
  return {
    model: 'fake-hash-embedding',
    dimensions: DIMENSIONS,
    generateEmbedding: vi.fn(async (text: string) => hashEmbedding(text)),
    generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(hashEmbedding)),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!dbAvailable)('rediscovery integration', () => {
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.upsert({
      where: { email: 'subphased-rediscovery-smoke@test.dev' },
      create: { email: 'subphased-rediscovery-smoke@test.dev', passwordHash: 'x' },
      update: {},
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.savedItem.deleteMany({ where: { userId } });
    await db.collection.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('getRecentlySaved orders items by createdAt descending', async () => {
    const older = await createSavedItem(userId, { type: 'NOTE', title: 'Older note', content: 'x' });
    await db.savedItem.update({ where: { id: older.id }, data: { createdAt: new Date(Date.now() - 2 * DAY_MS) } });
    const newer = await createSavedItem(userId, { type: 'NOTE', title: 'Newer note', content: 'y' });

    const recent = await getRecentlySaved(userId, 2);
    expect(recent[0].id).toBe(newer.id);
    expect(recent.map((r) => r.id)).toContain(older.id);
  });

  it('getForgottenItems surfaces old, never-viewed items but not new or recently-viewed ones', async () => {
    const forgotten = await createSavedItem(userId, { type: 'NOTE', title: 'Forgotten item', content: 'z' });
    await db.savedItem.update({
      where: { id: forgotten.id },
      data: { createdAt: new Date(Date.now() - 30 * DAY_MS), lastViewedAt: null },
    });

    const recentlyViewedOld = await createSavedItem(userId, { type: 'NOTE', title: 'Old but recently viewed', content: 'w' });
    await db.savedItem.update({
      where: { id: recentlyViewedOld.id },
      data: { createdAt: new Date(Date.now() - 30 * DAY_MS), lastViewedAt: new Date() },
    });

    const brandNew = await createSavedItem(userId, { type: 'NOTE', title: 'Brand new item', content: 'v' });

    const forgottenItems = await getForgottenItems(userId, 20);
    const ids = forgottenItems.map((f) => f.id);
    expect(ids).toContain(forgotten.id);
    expect(ids).not.toContain(recentlyViewedOld.id);
    expect(ids).not.toContain(brandNew.id);
  });

  it('getRelatedDiscoveries pairs a recent item with an older, topically-similar one', async () => {
    const provider = fakeEmbeddingProvider();

    const oldItem = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'Old orchestration note',
      content: 'Agent orchestration frameworks for autonomous AI agents. Agent orchestration is hard.',
    });
    await db.savedItem.update({
      where: { id: oldItem.id },
      data: { createdAt: new Date(Date.now() - 60 * DAY_MS), summary: 'Agent orchestration frameworks for autonomous AI agents.' },
    });
    await indexSavedItemEmbeddings(userId, oldItem.id, provider);

    const newItem = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'New agents note',
      content: 'AI agents and agent orchestration frameworks. Autonomous AI agents need orchestration.',
    });
    await db.savedItem.update({ where: { id: newItem.id }, data: { summary: newItem.content! } });
    await indexSavedItemEmbeddings(userId, newItem.id, provider);

    const discoveries = await getRelatedDiscoveries(userId, 20);
    const match = discoveries.find((d) => d.anchor.id === newItem.id && d.relatedItem.id === oldItem.id);
    expect(match).toBeDefined();
  });

  it('suggestCollections clusters similar uncollected items and excludes ones already in a collection', async () => {
    const provider = fakeEmbeddingProvider();

    const itemA = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'Startup idea A',
      content: 'Startup idea about marketplaces. Marketplace startup idea, two-sided marketplace.',
    });
    await db.savedItem.update({ where: { id: itemA.id }, data: { summary: itemA.content! } });
    await indexSavedItemEmbeddings(userId, itemA.id, provider);

    const itemB = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'Startup idea B',
      content: 'Another marketplace startup idea. Two-sided marketplace startup idea.',
    });
    await db.savedItem.update({ where: { id: itemB.id }, data: { summary: itemB.content! } });
    await indexSavedItemEmbeddings(userId, itemB.id, provider);

    const unrelated = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'Cooking notes',
      content: 'A recipe for lasagna with bechamel sauce and fresh basil.',
    });
    await db.savedItem.update({ where: { id: unrelated.id }, data: { summary: unrelated.content! } });
    await indexSavedItemEmbeddings(userId, unrelated.id, provider);

    const alreadyCollected = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'Startup idea C (already organized)',
      content: 'A marketplace startup idea, two-sided marketplace, already in a collection.',
    });
    await db.savedItem.update({ where: { id: alreadyCollected.id }, data: { summary: alreadyCollected.content! } });
    await indexSavedItemEmbeddings(userId, alreadyCollected.id, provider);
    const existingCollection = await db.collection.create({ data: { userId, name: 'Existing' } });
    await db.savedItemCollection.create({ data: { savedItemId: alreadyCollected.id, collectionId: existingCollection.id } });

    const suggestions = await suggestCollections(userId);
    const marketplaceCluster = suggestions.find((s) => s.itemIds.includes(itemA.id) && s.itemIds.includes(itemB.id));

    expect(marketplaceCluster).toBeDefined();
    expect(marketplaceCluster!.itemIds).not.toContain(unrelated.id);
    expect(marketplaceCluster!.itemIds).not.toContain(alreadyCollected.id);

    const created = await acceptSuggestedCollection(userId, {
      name: marketplaceCluster!.name,
      itemIds: marketplaceCluster!.itemIds,
    });
    expect(created.isAiSuggested).toBe(true);

    const withItems = await db.collection.findFirst({ where: { id: created.id }, include: { items: true } });
    expect(withItems?.items.map((i) => i.savedItemId).sort()).toEqual([itemA.id, itemB.id].sort());

    await db.collection.deleteMany({ where: { id: { in: [created.id, existingCollection.id] } } });
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createSavedItem } from '../saved-items';
import { indexSavedItemEmbeddings } from '../embedding-index';
import { findRelatedItems, searchKnowledgeBase } from '../search';
import type { EmbeddingProvider } from '@/lib/embeddings/types';

/**
 * Real semantic accuracy needs a live embedding model — out of scope for an
 * offline test suite. What's testable and worth testing without network
 * access is the *mechanism*: does cosine-similarity ranking over pgvector
 * actually rank topically-similar items above dissimilar ones, do filters
 * narrow results correctly, and does the empty-query guard actually skip the
 * embedding call. A deterministic hashed bag-of-words "embedding" is enough
 * to exercise that real query path meaningfully.
 *
 * Needs a real database (pgvector) — skips cleanly if none is reachable, same
 * pattern as audio-pipeline.integration.test.ts.
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

describe.skipIf(!dbAvailable)('search integration', () => {
  let userId: string;
  let agentsItemId: string;
  let orchestrationItemId: string;
  let databaseItemId: string;

  beforeAll(async () => {
    const user = await db.user.upsert({
      where: { email: 'phase4-search-smoke@test.dev' },
      create: { email: 'phase4-search-smoke@test.dev', passwordHash: 'x' },
      update: {},
    });
    userId = user.id;

    const provider = fakeEmbeddingProvider();

    // Content is written with heavy, deliberate lexical overlap between the two
    // "agent" items so a crude bag-of-words fake embedding (see hashEmbedding
    // above) produces a similarity score that clears the production
    // MIN_RELATED_SIMILARITY threshold in search.ts — a real embedding model
    // would do this from meaning alone with far less repetition, but the fake
    // needs the help to exercise that threshold logic meaningfully.
    const agentsItem = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'AI agents note',
      content:
        'AI agents and agent orchestration. Autonomous AI agents use agent orchestration frameworks. Agent orchestration for AI agents.',
    });
    agentsItemId = agentsItem.id;
    await db.savedItem.update({ where: { id: agentsItemId }, data: { summary: agentsItem.content! } });
    await indexSavedItemEmbeddings(userId, agentsItemId, provider);

    const orchestrationItem = await createSavedItem(userId, {
      type: 'GITHUB',
      title: 'LangGraph repo',
      content:
        'Agent orchestration with AI agents. LangGraph provides agent orchestration for AI agents. AI agents and agent orchestration workflows.',
      projects: ['Research'],
    });
    orchestrationItemId = orchestrationItem.id;
    await db.savedItem.update({
      where: { id: orchestrationItemId },
      data: { summary: orchestrationItem.content! },
    });
    await indexSavedItemEmbeddings(userId, orchestrationItemId, provider);

    const databaseItem = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'Postgres indexing note',
      content:
        'Postgres database indexing. Query planning and database performance tuning. Database indexing strategies for Postgres.',
    });
    databaseItemId = databaseItem.id;
    await db.savedItem.update({ where: { id: databaseItemId }, data: { summary: databaseItem.content! } });
    await indexSavedItemEmbeddings(userId, databaseItemId, provider);
  });

  afterAll(async () => {
    await db.savedItem.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('ranks topically similar items above dissimilar ones (search accuracy / similar item retrieval)', async () => {
    const provider = fakeEmbeddingProvider();
    const result = await searchKnowledgeBase(userId, { q: 'AI agent orchestration' }, provider);

    expect(result.items.length).toBeGreaterThanOrEqual(2);
    const ids = result.items.map((r) => r.id);
    const agentsRank = ids.indexOf(agentsItemId);
    const orchestrationRank = ids.indexOf(orchestrationItemId);
    const databaseRank = ids.indexOf(databaseItemId);

    expect(agentsRank).toBeGreaterThanOrEqual(0);
    expect(orchestrationRank).toBeGreaterThanOrEqual(0);
    // the two agent-related items should both rank above the unrelated database note
    if (databaseRank !== -1) {
      expect(agentsRank).toBeLessThan(databaseRank);
      expect(orchestrationRank).toBeLessThan(databaseRank);
    }
  });

  it('returns no results when a filter matches nothing', async () => {
    const provider = fakeEmbeddingProvider();
    const result = await searchKnowledgeBase(
      userId,
      { q: 'AI agent orchestration', project: 'Nonexistent Project' },
      provider,
    );
    expect(result.items).toEqual([]);
  });

  it('narrows results with a project filter', async () => {
    const provider = fakeEmbeddingProvider();
    const result = await searchKnowledgeBase(userId, { q: 'AI agent orchestration', project: 'Research' }, provider);
    expect(result.items.every((r) => r.id === orchestrationItemId)).toBe(true);
  });

  it('skips the embedding call entirely for an empty query', async () => {
    const provider = fakeEmbeddingProvider();
    const result = await searchKnowledgeBase(userId, { q: '   ' }, provider);
    expect(result).toEqual({ items: [], relatedObjects: [] });
    expect(provider.generateEmbedding).not.toHaveBeenCalled();
  });

  it('finds related items using the item\'s own stored embedding, no new API call', async () => {
    const related = await findRelatedItems(userId, agentsItemId);
    const ids = related.map((r) => r.id);
    expect(ids).toContain(orchestrationItemId);
    expect(ids).not.toContain(agentsItemId);
  });
});

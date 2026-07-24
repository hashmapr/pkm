import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createSavedItem } from '../saved-items';
import { indexSavedItemEmbeddings } from '../embedding-index';
import { askAssistant } from '../assistant-chat';
import { getConversationWithMessages } from '../conversations';
import type { EmbeddingProvider } from '@/lib/embeddings/types';
import type { AssistantAnswer, AssistantProvider, AssistantQueryInput } from '@/lib/assistant/types';

/**
 * Needs a real database (pgvector) — skips cleanly if none is reachable,
 * same pattern as search.integration.test.ts. Uses the same deterministic
 * hashed bag-of-words fake embedding as that file (real semantic accuracy
 * needs a live embedding model, out of scope for an offline suite; the
 * mechanism — does retrieval actually rank correctly and thread through to
 * a persisted, citation-validated conversation — is what's testable and
 * worth testing here).
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

function citeEverythingProvider(): AssistantProvider {
  const answer = vi.fn(async (input: AssistantQueryInput): Promise<AssistantAnswer> => ({
    answer: `Answer based on ${input.context.length} source(s).`,
    sourceIndexes: input.context.map((_, i) => i + 1),
    confidence: 0.9,
    suggestedActions: [],
  }));
  return { answerQuestion: answer, summarizeKnowledge: answer, compareKnowledge: answer, findConflicts: answer };
}

describe.skipIf(!dbAvailable)('assistant chat integration', () => {
  let userId: string;
  let dbItemId: string;
  let decisionSavedItemId: string;

  beforeAll(async () => {
    const user = await db.user.upsert({
      where: { email: 'phase5-assistant-smoke@test.dev' },
      create: { email: 'phase5-assistant-smoke@test.dev', passwordHash: 'x' },
      update: {},
    });
    userId = user.id;

    const embeddingProvider = fakeEmbeddingProvider();

    // Same heavy-overlap fixture pattern as search.integration.test.ts, for
    // the same reason: a crude bag-of-words fake embedding needs the help to
    // produce a meaningfully high similarity for "database" questions.
    const dbItem = await createSavedItem(userId, {
      type: 'NOTE',
      title: 'Database choice note',
      content: 'We use Postgres database for the database. Postgres is our database choice.',
    });
    dbItemId = dbItem.id;
    await db.savedItem.update({ where: { id: dbItemId }, data: { summary: dbItem.content! } });
    await db.decision.create({
      data: {
        savedItemId: dbItemId,
        statement: 'Use PostgreSQL as the database',
        reasoning: 'Already supports pgvector for embeddings, one engine instead of three',
        confidence: 0.9,
      },
    });
    await indexSavedItemEmbeddings(userId, dbItemId, embeddingProvider);

    decisionSavedItemId = dbItemId;
  });

  afterAll(async () => {
    await db.savedItem.deleteMany({ where: { userId } });
    await db.conversation.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it('retrieves relevant sources and attributes cited sources correctly (retrieval accuracy / source attribution)', async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const assistantProvider = citeEverythingProvider();

    const result = await askAssistant(
      userId,
      'What database did we decide to use?',
      undefined,
      'ANSWER',
      assistantProvider,
      embeddingProvider,
    );

    expect(assistantProvider.answerQuestion).toHaveBeenCalledOnce();
    const callArgs = (assistantProvider.answerQuestion as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.context.length).toBeGreaterThan(0);
    expect(callArgs.context.some((c: { entityType: string }) => c.entityType === 'DECISION')).toBe(true);

    const sourcesUsed = result.assistantMessage.sourcesUsed as { sources: { savedItemId: string }[] };
    expect(sourcesUsed.sources.length).toBeGreaterThan(0);
    expect(sourcesUsed.sources.every((s) => s.savedItemId === decisionSavedItemId)).toBe(true);
  });

  it('short-circuits to a canned answer and never calls the provider when nothing is retrieved (missing information)', async () => {
    const otherUser = await db.user.create({
      data: { email: `phase5-empty-${Date.now()}@test.dev`, passwordHash: 'x' },
    });
    const embeddingProvider = fakeEmbeddingProvider();
    const assistantProvider = citeEverythingProvider();

    const result = await askAssistant(
      otherUser.id,
      'What did I decide about anything?',
      undefined,
      'ANSWER',
      assistantProvider,
      embeddingProvider,
    );

    expect(assistantProvider.answerQuestion).not.toHaveBeenCalled();
    expect(result.assistantMessage.content).toMatch(/don't have any saved information/i);
    const sourcesUsed = result.assistantMessage.sourcesUsed as { sources: unknown[]; confidence: number };
    expect(sourcesUsed.sources).toEqual([]);
    expect(sourcesUsed.confidence).toBe(0);

    await db.user.delete({ where: { id: otherUser.id } });
  });

  it('drops a fabricated out-of-range source index (hallucination prevention)', async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const hallucinatingAnswer = vi.fn(async (input: AssistantQueryInput): Promise<AssistantAnswer> => ({
      answer: 'Fabricated citation test.',
      sourceIndexes: [1, 99], // 99 does not exist in the retrieved context
      confidence: 0.7,
      suggestedActions: [],
    }));
    const provider: AssistantProvider = {
      answerQuestion: hallucinatingAnswer,
      summarizeKnowledge: hallucinatingAnswer,
      compareKnowledge: hallucinatingAnswer,
      findConflicts: hallucinatingAnswer,
    };

    const result = await askAssistant(
      userId,
      'What database did we pick?',
      undefined,
      'ANSWER',
      provider,
      embeddingProvider,
    );

    const sourcesUsed = result.assistantMessage.sourcesUsed as { sources: unknown[] };
    // exactly one valid citation (index 1) survives; index 99 is dropped, not
    // rendered as a real source
    expect(sourcesUsed.sources.length).toBe(1);
  });

  it('threads prior turns into the next call and persists full conversation history in order', async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const assistantProvider = citeEverythingProvider();

    const first = await askAssistant(
      userId,
      'What database did we decide to use?',
      undefined,
      'ANSWER',
      assistantProvider,
      embeddingProvider,
    );

    await askAssistant(
      userId,
      'Why did we choose that?',
      first.conversation.id,
      'ANSWER',
      assistantProvider,
      embeddingProvider,
    );

    const secondCallArgs = (assistantProvider.answerQuestion as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCallArgs.history.length).toBeGreaterThanOrEqual(2);
    expect(secondCallArgs.history[0].role).toBe('USER');
    expect(secondCallArgs.history.some((h: { content: string }) => h.content.includes('database'))).toBe(true);

    const reloaded = await getConversationWithMessages(userId, first.conversation.id);
    expect(reloaded?.messages).toHaveLength(4);
    expect(reloaded?.messages.map((m) => m.role)).toEqual(['USER', 'ASSISTANT', 'USER', 'ASSISTANT']);
  });
});

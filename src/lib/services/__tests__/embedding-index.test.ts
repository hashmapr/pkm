import { describe, expect, it } from 'vitest';
import {
  runEmbeddingSafely,
  textForDecision,
  textForEntity,
  textForQuestion,
  textForSavedItem,
  textForTask,
  toVectorLiteral,
} from '../embedding-index';
import { EmbeddingProviderError } from '@/lib/embeddings/errors';
import type { EmbeddingProvider } from '@/lib/embeddings/types';

describe('text-building functions', () => {
  it('combines title, summary, keyPoints, and a content slice for a saved item', () => {
    const text = textForSavedItem({
      title: 'AI agents note',
      summary: 'Thoughts on agent orchestration.',
      keyPoints: ['Agents need memory', 'Orchestration is hard'],
      content: 'Long transcript body...',
    });
    expect(text).toContain('AI agents note');
    expect(text).toContain('Thoughts on agent orchestration.');
    expect(text).toContain('Agents need memory. Orchestration is hard');
    expect(text).toContain('Long transcript body...');
  });

  it('falls back to just the title when nothing else is present', () => {
    const text = textForSavedItem({ title: 'Bare note', summary: null, keyPoints: [], content: null });
    expect(text).toBe('Bare note');
  });

  it('builds task text with description when present', () => {
    expect(textForTask({ title: 'Prototype orchestrator', description: 'Use LangGraph' })).toBe(
      'Prototype orchestrator: Use LangGraph',
    );
    expect(textForTask({ title: 'Prototype orchestrator', description: null })).toBe('Prototype orchestrator');
  });

  it('builds decision text with reasoning when present', () => {
    expect(textForDecision({ statement: 'Use Postgres', reasoning: 'Already in the stack' })).toBe(
      'Use Postgres — Already in the stack',
    );
    expect(textForDecision({ statement: 'Use Postgres', reasoning: null })).toBe('Use Postgres');
  });

  it('builds question text as-is', () => {
    expect(textForQuestion({ question: 'Which framework is best?' })).toBe('Which framework is best?');
  });

  it('builds entity text with type context', () => {
    expect(textForEntity({ name: 'LangGraph', type: 'TECHNOLOGY' })).toBe('LangGraph (TECHNOLOGY)');
  });
});

describe('toVectorLiteral', () => {
  it('formats a numeric array as a pgvector literal', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });
});

describe('runEmbeddingSafely — embedding generation success and failure', () => {
  function fakeProvider(overrides: Partial<EmbeddingProvider>): EmbeddingProvider {
    return {
      model: 'fake-model',
      dimensions: 3,
      generateEmbedding: async () => {
        throw new Error('not implemented in fake');
      },
      generateEmbeddings: async () => {
        throw new Error('not implemented in fake');
      },
      ...overrides,
    };
  }

  it('returns success with the generated vectors', async () => {
    const provider = fakeProvider({ generateEmbeddings: async (texts) => texts.map(() => [1, 2, 3]) });
    const outcome = await runEmbeddingSafely(provider, ['a', 'b']);
    expect(outcome).toEqual({ success: true, data: [[1, 2, 3], [1, 2, 3]] });
  });

  it('returns a failure outcome when the provider throws EmbeddingProviderError', async () => {
    const provider = fakeProvider({
      generateEmbeddings: async () => {
        throw new EmbeddingProviderError('OpenAI embedding request failed');
      },
    });
    const outcome = await runEmbeddingSafely(provider, ['a']);
    expect(outcome.success).toBe(false);
    if (!outcome.success) expect(outcome.error).toMatch(/OpenAI embedding request failed/);
  });

  it('returns a failure outcome instead of throwing for an unexpected error', async () => {
    const provider = fakeProvider({
      generateEmbeddings: async () => {
        throw new Error('network timeout');
      },
    });
    const outcome = await runEmbeddingSafely(provider, ['a']);
    expect(outcome).toEqual({ success: false, error: 'network timeout' });
  });
});

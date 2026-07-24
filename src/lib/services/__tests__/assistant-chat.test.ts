import { describe, expect, it } from 'vitest';
import { runAssistantSafely, validateSourceIndexes } from '../assistant-chat';
import { AssistantProviderError, AssistantResponseValidationError } from '@/lib/assistant/errors';
import type { AssistantProvider, AssistantAnswer } from '@/lib/assistant/types';

const sampleAnswer: AssistantAnswer = {
  answer: 'You chose PostgreSQL because it already supported pgvector.',
  sourceIndexes: [1],
  confidence: 0.8,
  suggestedActions: [],
};

function notImplemented(): never {
  throw new Error('not implemented in fake provider');
}

function fakeProvider(overrides: Partial<AssistantProvider>): AssistantProvider {
  return {
    answerQuestion: notImplemented,
    summarizeKnowledge: notImplemented,
    compareKnowledge: notImplemented,
    findConflicts: notImplemented,
    ...overrides,
  };
}

describe('runAssistantSafely — dispatches by mode and normalizes failures', () => {
  const input = { question: 'What did I decide about databases?', context: [], history: [] };

  it('calls answerQuestion for ANSWER mode and returns success', async () => {
    const provider = fakeProvider({ answerQuestion: async () => sampleAnswer });
    const outcome = await runAssistantSafely(provider, 'ANSWER', input);
    expect(outcome).toEqual({ success: true, data: sampleAnswer });
  });

  it('calls summarizeKnowledge for SUMMARIZE mode', async () => {
    const provider = fakeProvider({ summarizeKnowledge: async () => sampleAnswer });
    const outcome = await runAssistantSafely(provider, 'SUMMARIZE', input);
    expect(outcome).toEqual({ success: true, data: sampleAnswer });
  });

  it('calls compareKnowledge for COMPARE mode', async () => {
    const provider = fakeProvider({ compareKnowledge: async () => sampleAnswer });
    const outcome = await runAssistantSafely(provider, 'COMPARE', input);
    expect(outcome).toEqual({ success: true, data: sampleAnswer });
  });

  it('calls findConflicts for FIND_CONFLICTS mode', async () => {
    const provider = fakeProvider({ findConflicts: async () => sampleAnswer });
    const outcome = await runAssistantSafely(provider, 'FIND_CONFLICTS', input);
    expect(outcome).toEqual({ success: true, data: sampleAnswer });
  });

  it('returns a failure outcome when the provider throws AssistantProviderError', async () => {
    const provider = fakeProvider({
      answerQuestion: async () => {
        throw new AssistantProviderError('Claude API request failed');
      },
    });
    const outcome = await runAssistantSafely(provider, 'ANSWER', input);
    expect(outcome.success).toBe(false);
    if (!outcome.success) expect(outcome.error).toMatch(/Claude API request failed/);
  });

  it('returns a failure outcome when the provider throws AssistantResponseValidationError', async () => {
    const provider = fakeProvider({
      answerQuestion: async () => {
        throw new AssistantResponseValidationError('Assistant response was not valid JSON');
      },
    });
    const outcome = await runAssistantSafely(provider, 'ANSWER', input);
    expect(outcome.success).toBe(false);
    if (!outcome.success) expect(outcome.error).toMatch(/not valid JSON/);
  });

  it('returns a failure outcome instead of throwing for an unexpected error', async () => {
    const provider = fakeProvider({
      answerQuestion: async () => {
        throw new Error('network timeout');
      },
    });
    const outcome = await runAssistantSafely(provider, 'ANSWER', input);
    expect(outcome).toEqual({ success: false, error: 'network timeout' });
  });
});

describe('validateSourceIndexes — hallucination prevention', () => {
  it('keeps indexes within bounds', () => {
    expect(validateSourceIndexes([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it('drops an out-of-range fabricated index', () => {
    expect(validateSourceIndexes([1, 99], 3)).toEqual([1]);
  });

  it('drops zero and negative indexes', () => {
    expect(validateSourceIndexes([0, -1, 2], 3)).toEqual([2]);
  });

  it('drops non-integer indexes', () => {
    expect(validateSourceIndexes([1.5, 2], 3)).toEqual([2]);
  });

  it('de-duplicates repeated indexes', () => {
    expect(validateSourceIndexes([2, 2, 1], 3)).toEqual([1, 2]);
  });

  it('returns an empty array when context was empty', () => {
    expect(validateSourceIndexes([1, 2], 0)).toEqual([]);
  });
});

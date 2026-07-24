import { describe, expect, it } from 'vitest';
import { hasProcessableContent, runExtractionSafely } from '../processing';
import { AIProviderError, AIResponseValidationError } from '@/lib/ai/errors';
import type { AIProvider, SavedItemForAnalysis } from '@/lib/ai/types';
import type { AIExtractionResult } from '@/lib/ai/extraction';

const sampleInput: SavedItemForAnalysis = {
  type: 'NOTE',
  title: 'AI agents note',
  content: 'Thinking about agent orchestration frameworks.',
};

const sampleResult: AIExtractionResult = {
  summary: 'A note about AI agent orchestration.',
  keyPoints: ['Agents need memory'],
  tags: ['ai', 'agents'],
  entities: [],
  tasks: [],
  decisions: [],
  questions: [],
};

function notImplemented(): never {
  throw new Error('not implemented in fake provider');
}

function fakeProvider(overrides: Partial<AIProvider>): AIProvider {
  return {
    summarize: notImplemented,
    extractEntities: notImplemented,
    extractTasks: notImplemented,
    classifyItem: notImplemented,
    generateTags: notImplemented,
    findRelationships: notImplemented,
    analyze: notImplemented,
    ...overrides,
  };
}

describe('hasProcessableContent — empty content', () => {
  it('returns false for null', () => {
    expect(hasProcessableContent(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasProcessableContent(undefined)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(hasProcessableContent('')).toBe(false);
  });

  it('returns false for whitespace-only content', () => {
    expect(hasProcessableContent('   \n\t  ')).toBe(false);
  });

  it('returns true for non-empty content', () => {
    expect(hasProcessableContent('Some real content.')).toBe(true);
  });
});

describe('runExtractionSafely — failed AI responses', () => {
  it('returns a success outcome when the provider resolves', async () => {
    const provider = fakeProvider({ analyze: async () => sampleResult });
    const outcome = await runExtractionSafely(provider, sampleInput);
    expect(outcome).toEqual({ success: true, data: sampleResult });
  });

  it('returns a failure outcome when the provider throws AIProviderError (upstream failure)', async () => {
    const provider = fakeProvider({
      analyze: async () => {
        throw new AIProviderError('Claude API request failed');
      },
    });
    const outcome = await runExtractionSafely(provider, sampleInput);
    expect(outcome.success).toBe(false);
    if (!outcome.success) expect(outcome.error).toMatch(/Claude API request failed/);
  });

  it('returns a failure outcome when the provider throws AIResponseValidationError (malformed JSON)', async () => {
    const provider = fakeProvider({
      analyze: async () => {
        throw new AIResponseValidationError('AI response was not valid JSON', '{ broken');
      },
    });
    const outcome = await runExtractionSafely(provider, sampleInput);
    expect(outcome.success).toBe(false);
    if (!outcome.success) expect(outcome.error).toMatch(/not valid JSON/);
  });

  it('returns a failure outcome instead of throwing for an unexpected error', async () => {
    const provider = fakeProvider({
      analyze: async () => {
        throw new Error('network timeout');
      },
    });
    const outcome = await runExtractionSafely(provider, sampleInput);
    expect(outcome).toEqual({ success: false, error: 'network timeout' });
  });
});

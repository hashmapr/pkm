import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantProviderError } from '../errors';
import type { AssistantQueryInput } from '../types';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: createMock } };
    constructor(public options: { baseURL?: string; apiKey?: string }) {}
  },
}));

const validAnswer = {
  answer: 'You decided to use a graph-based orchestrator.',
  sourceIndexes: [1],
  confidence: 0.8,
  suggestedActions: [],
};

const sampleInput: AssistantQueryInput = {
  question: 'What did I decide about databases?',
  context: [
    {
      entityType: 'DECISION',
      entityId: 'd1',
      savedItemId: 'i1',
      savedItemTitle: 'Agent orchestration notes',
      savedItemType: 'NOTE',
      label: 'Use a graph-based orchestrator',
      similarity: 0.9,
      createdAt: new Date().toISOString(),
    },
  ],
  history: [],
};

describe('OpenAICompatibleAssistantProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('sends a system + user message and parses the answer', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validAnswer) } }] });
    const { OpenAICompatibleAssistantProvider } = await import('../openai-compatible-assistant-provider');
    const provider = new OpenAICompatibleAssistantProvider({ baseURL: 'http://localhost:11434/v1', model: 'llama3.1' });

    const result = await provider.answerQuestion(sampleInput);

    expect(result.answer).toBe(validAnswer.answer);
    expect(result.sourceIndexes).toEqual([1]);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('llama3.1');
    expect(call.messages[0].role).toBe('system');
  });

  it('throws AssistantProviderError when the response has no text content', async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }] });
    const { OpenAICompatibleAssistantProvider } = await import('../openai-compatible-assistant-provider');
    const provider = new OpenAICompatibleAssistantProvider({ baseURL: 'http://localhost:11434/v1', model: 'llama3.1' });

    await expect(provider.answerQuestion(sampleInput)).rejects.toThrow(AssistantProviderError);
  });

  it('wraps an underlying request failure in AssistantProviderError', async () => {
    createMock.mockRejectedValue(new Error('connection refused'));
    const { OpenAICompatibleAssistantProvider } = await import('../openai-compatible-assistant-provider');
    const provider = new OpenAICompatibleAssistantProvider({ baseURL: 'http://localhost:11434/v1', model: 'llama3.1' });

    await expect(provider.summarizeKnowledge(sampleInput)).rejects.toThrow(AssistantProviderError);
  });
});

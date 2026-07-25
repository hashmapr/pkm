import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProviderError } from '../errors';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: createMock } };
    constructor(public options: { baseURL?: string; apiKey?: string }) {}
  },
}));

const validResponse = {
  summary: 'A note about building AI agents.',
  keyPoints: ['Agents need memory'],
  tags: ['ai'],
  entities: [],
  tasks: [],
  decisions: [],
  questions: [],
};

describe('OpenAICompatibleAIProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('sends a system + user message and parses the JSON response', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validResponse) } }] });
    const { OpenAICompatibleAIProvider } = await import('../openai-compatible-provider');
    const provider = new OpenAICompatibleAIProvider({ baseURL: 'http://localhost:11434/v1', model: 'llama3.1' });

    const result = await provider.analyze({ type: 'NOTE', title: 'Agents', content: 'Some content' });

    expect(result.summary).toBe(validResponse.summary);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('llama3.1');
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[1].role).toBe('user');
  });

  it('throws AIProviderError when the response has no text content', async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }] });
    const { OpenAICompatibleAIProvider } = await import('../openai-compatible-provider');
    const provider = new OpenAICompatibleAIProvider({ baseURL: 'http://localhost:11434/v1', model: 'llama3.1' });

    await expect(
      provider.analyze({ type: 'NOTE', title: 'Agents', content: 'Some content' }),
    ).rejects.toThrow(AIProviderError);
  });

  it('wraps an underlying request failure in AIProviderError', async () => {
    createMock.mockRejectedValue(new Error('connection refused'));
    const { OpenAICompatibleAIProvider } = await import('../openai-compatible-provider');
    const provider = new OpenAICompatibleAIProvider({ baseURL: 'http://localhost:11434/v1', model: 'llama3.1' });

    await expect(
      provider.summarize({ type: 'NOTE', title: 'Agents', content: 'Some content' }),
    ).rejects.toThrow(AIProviderError);
  });

  it('short-circuits findRelationships with no candidates instead of calling the model', async () => {
    const { OpenAICompatibleAIProvider } = await import('../openai-compatible-provider');
    const provider = new OpenAICompatibleAIProvider({ baseURL: 'http://localhost:11434/v1', model: 'llama3.1' });

    const result = await provider.findRelationships({ type: 'NOTE', title: 'Agents', content: 'x' }, []);
    expect(result).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('getAIProvider — provider selection', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to ClaudeProvider and requires ANTHROPIC_API_KEY', async () => {
    const { getAIProvider } = await import('../index');
    expect(() => getAIProvider()).toThrow('ANTHROPIC_API_KEY');

    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { ClaudeProvider } = await import('../claude-provider');
    const provider = getAIProvider();
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('AI_PROVIDER=openai-compatible requires base URL and model', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    const { getAIProvider } = await import('../index');
    expect(() => getAIProvider()).toThrow('OPENAI_COMPATIBLE_BASE_URL');

    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://localhost:11434/v1';
    expect(() => getAIProvider()).toThrow('OPENAI_COMPATIBLE_MODEL');

    process.env.OPENAI_COMPATIBLE_MODEL = 'llama3.1';
    const { OpenAICompatibleAIProvider } = await import('../openai-compatible-provider');
    const provider = getAIProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleAIProvider);
  });
});

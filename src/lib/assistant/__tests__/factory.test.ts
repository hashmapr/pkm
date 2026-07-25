import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('getAssistantProvider — provider selection', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ASSISTANT_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to ClaudeAssistantProvider and requires ANTHROPIC_API_KEY', async () => {
    const { getAssistantProvider } = await import('../index');
    expect(() => getAssistantProvider()).toThrow('ANTHROPIC_API_KEY');

    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { ClaudeAssistantProvider } = await import('../claude-assistant-provider');
    const provider = getAssistantProvider();
    expect(provider).toBeInstanceOf(ClaudeAssistantProvider);
  });

  it('ASSISTANT_PROVIDER=openai-compatible requires base URL and model', async () => {
    process.env.ASSISTANT_PROVIDER = 'openai-compatible';
    const { getAssistantProvider } = await import('../index');
    expect(() => getAssistantProvider()).toThrow('OPENAI_COMPATIBLE_BASE_URL');

    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://localhost:11434/v1';
    expect(() => getAssistantProvider()).toThrow('OPENAI_COMPATIBLE_MODEL');

    process.env.OPENAI_COMPATIBLE_MODEL = 'llama3.1';
    const { OpenAICompatibleAssistantProvider } = await import('../openai-compatible-assistant-provider');
    const provider = getAssistantProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleAssistantProvider);
  });
});

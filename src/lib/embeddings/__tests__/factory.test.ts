import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('getEmbeddingProvider — provider selection', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    delete process.env.OPENAI_COMPATIBLE_EMBEDDING_MODEL;
    delete process.env.OPENAI_COMPATIBLE_EMBEDDING_DIMENSIONS;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to OpenAI and requires OPENAI_API_KEY', async () => {
    const { getEmbeddingProvider } = await import('../index');
    expect(() => getEmbeddingProvider()).toThrow('OPENAI_API_KEY');

    process.env.OPENAI_API_KEY = 'test-key';
    const provider = getEmbeddingProvider();
    expect(provider.dimensions).toBe(1536);
  });

  it('EMBEDDING_PROVIDER=openai-compatible requires base URL and model, honors custom dimensions', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai-compatible';
    const { getEmbeddingProvider } = await import('../index');
    expect(() => getEmbeddingProvider()).toThrow('OPENAI_COMPATIBLE_BASE_URL');

    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://localhost:11434/v1';
    expect(() => getEmbeddingProvider()).toThrow('OPENAI_COMPATIBLE_EMBEDDING_MODEL');

    process.env.OPENAI_COMPATIBLE_EMBEDDING_MODEL = 'nomic-embed-text';
    process.env.OPENAI_COMPATIBLE_EMBEDDING_DIMENSIONS = '768';
    const provider = getEmbeddingProvider();
    expect(provider.model).toBe('nomic-embed-text');
    expect(provider.dimensions).toBe(768);
  });
});

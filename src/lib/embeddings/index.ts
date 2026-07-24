import { OpenAIEmbeddingProvider } from './openai-provider';
import type { EmbeddingProvider } from './types';

let cachedProvider: EmbeddingProvider | undefined;

/**
 * Returns the configured EmbeddingProvider. Swapping embedding vendors means
 * changing this factory (and adding a new provider class) — no call site
 * changes. Reuses OPENAI_API_KEY (already configured for Whisper in Phase 3)
 * rather than introducing a third vendor for this one capability.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedProvider) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    cachedProvider = new OpenAIEmbeddingProvider({ apiKey, model: process.env.OPENAI_EMBEDDING_MODEL });
  }
  return cachedProvider;
}

export type { EmbeddingProvider } from './types';
export { EmbeddingProviderError } from './errors';

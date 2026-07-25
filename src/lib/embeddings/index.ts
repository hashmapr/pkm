import { OpenAIEmbeddingProvider } from './openai-provider';
import type { EmbeddingProvider } from './types';

let cachedProvider: EmbeddingProvider | undefined;

/**
 * Returns the configured EmbeddingProvider. Swapping embedding vendors means
 * changing this factory (and adding a new provider class) — no call site
 * changes. Reuses OPENAI_API_KEY (already configured for Whisper in Phase 3)
 * rather than introducing a third vendor for this one capability.
 *
 * EMBEDDING_PROVIDER=openai-compatible points the same OpenAI SDK client at a
 * local/self-hosted backend (Ollama, NVIDIA NIM) instead of api.openai.com.
 * IMPORTANT: the `embeddings.vector` column is a fixed-width `vector(1536)` —
 * a local embedding model with a different output width (e.g. Ollama's
 * nomic-embed-text at 768) needs a migration to resize that column before
 * this will work; see ARCHITECTURE.md.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cachedProvider) {
    const kind = process.env.EMBEDDING_PROVIDER ?? 'openai';
    if (kind === 'openai-compatible') {
      const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
      const model = process.env.OPENAI_COMPATIBLE_EMBEDDING_MODEL;
      if (!baseURL) throw new Error('OPENAI_COMPATIBLE_BASE_URL environment variable is not set');
      if (!model) throw new Error('OPENAI_COMPATIBLE_EMBEDDING_MODEL environment variable is not set');
      const dimensions = process.env.OPENAI_COMPATIBLE_EMBEDDING_DIMENSIONS
        ? Number(process.env.OPENAI_COMPATIBLE_EMBEDDING_DIMENSIONS)
        : undefined;
      cachedProvider = new OpenAIEmbeddingProvider({
        baseURL,
        model,
        dimensions,
        apiKey: process.env.OPENAI_COMPATIBLE_API_KEY ?? 'not-needed',
      });
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
      }
      cachedProvider = new OpenAIEmbeddingProvider({ apiKey, model: process.env.OPENAI_EMBEDDING_MODEL });
    }
  }
  return cachedProvider;
}

export type { EmbeddingProvider } from './types';
export { EmbeddingProviderError } from './errors';

import { ClaudeProvider } from './claude-provider';
import { OpenAICompatibleAIProvider } from './openai-compatible-provider';
import type { AIProvider } from './types';

let cachedProvider: AIProvider | undefined;

/**
 * Returns the configured AIProvider. This is the one place that knows which
 * vendor is in use — swapping models means changing this factory (and adding
 * a new provider class), not touching any call site.
 *
 * AI_PROVIDER=openai-compatible routes extraction through any local/self-hosted
 * backend that speaks the OpenAI chat-completions dialect (Ollama, NVIDIA NIM).
 * Default stays "claude" so existing deployments are unaffected.
 */
export function getAIProvider(): AIProvider {
  if (!cachedProvider) {
    const kind = process.env.AI_PROVIDER ?? 'claude';
    if (kind === 'openai-compatible') {
      const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
      const model = process.env.OPENAI_COMPATIBLE_MODEL;
      if (!baseURL) throw new Error('OPENAI_COMPATIBLE_BASE_URL environment variable is not set');
      if (!model) throw new Error('OPENAI_COMPATIBLE_MODEL environment variable is not set');
      cachedProvider = new OpenAICompatibleAIProvider({
        baseURL,
        model,
        apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      });
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
      }
      cachedProvider = new ClaudeProvider({ apiKey, model: process.env.ANTHROPIC_MODEL });
    }
  }
  return cachedProvider;
}

export type { AIProvider } from './types';
export * from './errors';

import { ClaudeProvider } from './claude-provider';
import type { AIProvider } from './types';

let cachedProvider: AIProvider | undefined;

/**
 * Returns the configured AIProvider. This is the one place that knows which
 * vendor is in use — swapping models means changing this factory (and adding
 * a new provider class), not touching any call site.
 */
export function getAIProvider(): AIProvider {
  if (!cachedProvider) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    cachedProvider = new ClaudeProvider({ apiKey, model: process.env.ANTHROPIC_MODEL });
  }
  return cachedProvider;
}

export type { AIProvider } from './types';
export * from './errors';

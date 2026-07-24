import { ClaudeAssistantProvider } from './claude-assistant-provider';
import type { AssistantProvider } from './types';

let cachedProvider: AssistantProvider | undefined;

/**
 * Returns the configured AssistantProvider. Swapping models means changing
 * this factory (and adding a new provider class) — no call site changes.
 */
export function getAssistantProvider(): AssistantProvider {
  if (!cachedProvider) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    cachedProvider = new ClaudeAssistantProvider({ apiKey, model: process.env.ANTHROPIC_ASSISTANT_MODEL });
  }
  return cachedProvider;
}

export type { AssistantProvider } from './types';
export { AssistantProviderError, AssistantResponseValidationError } from './errors';

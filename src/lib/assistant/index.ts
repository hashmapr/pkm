import { ClaudeAssistantProvider } from './claude-assistant-provider';
import { OpenAICompatibleAssistantProvider } from './openai-compatible-assistant-provider';
import type { AssistantProvider } from './types';

let cachedProvider: AssistantProvider | undefined;

/**
 * Returns the configured AssistantProvider. Swapping models means changing
 * this factory (and adding a new provider class) — no call site changes.
 *
 * ASSISTANT_PROVIDER=openai-compatible routes chat through any local/self-hosted
 * backend that speaks the OpenAI chat-completions dialect (Ollama, NVIDIA NIM).
 * Independent from AI_PROVIDER — you can extract with one backend and chat with
 * another — but shares the same OPENAI_COMPATIBLE_* connection config.
 */
export function getAssistantProvider(): AssistantProvider {
  if (!cachedProvider) {
    const kind = process.env.ASSISTANT_PROVIDER ?? 'claude';
    if (kind === 'openai-compatible') {
      const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
      const model = process.env.OPENAI_COMPATIBLE_MODEL;
      if (!baseURL) throw new Error('OPENAI_COMPATIBLE_BASE_URL environment variable is not set');
      if (!model) throw new Error('OPENAI_COMPATIBLE_MODEL environment variable is not set');
      cachedProvider = new OpenAICompatibleAssistantProvider({
        baseURL,
        model,
        apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      });
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
      }
      cachedProvider = new ClaudeAssistantProvider({ apiKey, model: process.env.ANTHROPIC_ASSISTANT_MODEL });
    }
  }
  return cachedProvider;
}

export type { AssistantProvider } from './types';
export { AssistantProviderError, AssistantResponseValidationError } from './errors';

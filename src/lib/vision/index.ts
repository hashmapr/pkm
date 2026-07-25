import { ClaudeVisionProvider } from './claude-vision-provider';
import type { VisionProvider } from './types';

let cachedProvider: VisionProvider | undefined;

/**
 * Returns the configured VisionProvider. Reuses ANTHROPIC_API_KEY — Claude
 * already handles this app's multimodal needs, no separate vendor/key
 * introduced for image understanding.
 */
export function getVisionProvider(): VisionProvider {
  if (!cachedProvider) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    cachedProvider = new ClaudeVisionProvider({ apiKey, model: process.env.ANTHROPIC_VISION_MODEL });
  }
  return cachedProvider;
}

export type { VisionInput, VisionProvider, VisionResult } from './types';
export { VisionProviderError, VisionResponseValidationError } from './errors';

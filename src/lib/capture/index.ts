import { CaptureProviderRegistry } from './registry';
import { NoteCaptureProvider } from './providers/note-provider';

let cachedRegistry: CaptureProviderRegistry | undefined;

/**
 * Returns the configured capture provider registry. WebProvider,
 * YouTubeProvider, GitHubProvider (Sub-Phase B) and ImageProvider,
 * ScreenshotProvider, PDFProvider (Sub-Phase C) register here once built —
 * NoteCaptureProvider is the only one implemented so far, as the fallback
 * for plain text with no URL and no file.
 */
export function getCaptureRegistry(): CaptureProviderRegistry {
  if (!cachedRegistry) {
    cachedRegistry = new CaptureProviderRegistry();
    cachedRegistry.register(new NoteCaptureProvider());
  }
  return cachedRegistry;
}

export type { CaptureInput, CaptureProvider, CaptureResult } from './types';
export { CaptureProviderRegistry } from './registry';
export { CaptureProviderError, NoCaptureProviderError } from './errors';

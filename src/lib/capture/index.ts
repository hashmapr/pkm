import { CaptureProviderRegistry } from './registry';
import { GitHubCaptureProvider } from './providers/github-provider';
import { NoteCaptureProvider } from './providers/note-provider';
import { WebCaptureProvider } from './providers/web-provider';
import { YouTubeCaptureProvider } from './providers/youtube-provider';

let cachedRegistry: CaptureProviderRegistry | undefined;

/**
 * Returns the configured capture provider registry. Order matters (first
 * match wins): YouTube and GitHub are registered before the generic
 * WebProvider so those URLs get source-specific extraction instead of
 * plain-webpage scraping; NoteCaptureProvider goes last as the fallback for
 * plain text with no URL and no file. ImageProvider, ScreenshotProvider,
 * PDFProvider (Sub-Phase C) register here once built.
 */
export function getCaptureRegistry(): CaptureProviderRegistry {
  if (!cachedRegistry) {
    cachedRegistry = new CaptureProviderRegistry();
    cachedRegistry.register(new YouTubeCaptureProvider());
    cachedRegistry.register(new GitHubCaptureProvider());
    cachedRegistry.register(new WebCaptureProvider());
    cachedRegistry.register(new NoteCaptureProvider());
  }
  return cachedRegistry;
}

export type { CaptureInput, CaptureProvider, CaptureResult } from './types';
export { CaptureProviderRegistry } from './registry';
export { CaptureProviderError, NoCaptureProviderError } from './errors';

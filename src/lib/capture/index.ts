import { CaptureProviderRegistry } from './registry';
import { GitHubCaptureProvider } from './providers/github-provider';
import { ImageCaptureProvider } from './providers/image-provider';
import { NoteCaptureProvider } from './providers/note-provider';
import { PDFCaptureProvider } from './providers/pdf-provider';
import { ScreenshotCaptureProvider } from './providers/screenshot-provider';
import { WebCaptureProvider } from './providers/web-provider';
import { YouTubeCaptureProvider } from './providers/youtube-provider';

let cachedRegistry: CaptureProviderRegistry | undefined;

/**
 * Returns the configured capture provider registry. Order matters (first
 * match wins): YouTube and GitHub are registered before the generic
 * WebProvider so those URLs get source-specific extraction instead of
 * plain-webpage scraping; Screenshot before Image since both match any image
 * file and only `hint` tells them apart; NoteCaptureProvider goes last as
 * the fallback for plain text with no URL and no file.
 */
export function getCaptureRegistry(): CaptureProviderRegistry {
  if (!cachedRegistry) {
    cachedRegistry = new CaptureProviderRegistry();
    cachedRegistry.register(new YouTubeCaptureProvider());
    cachedRegistry.register(new GitHubCaptureProvider());
    cachedRegistry.register(new WebCaptureProvider());
    cachedRegistry.register(new ScreenshotCaptureProvider());
    cachedRegistry.register(new ImageCaptureProvider());
    cachedRegistry.register(new PDFCaptureProvider());
    cachedRegistry.register(new NoteCaptureProvider());
  }
  return cachedRegistry;
}

export type { CaptureInput, CaptureProvider, CaptureResult } from './types';
export { CaptureProviderRegistry } from './registry';
export { CaptureProviderError, NoCaptureProviderError } from './errors';

import { CaptureProviderError } from '../errors';
import { getVisionProvider } from '@/lib/vision';
import { VisionProviderError, VisionResponseValidationError } from '@/lib/vision/errors';
import type { VisionProvider } from '@/lib/vision/types';
import type { CaptureInput, CaptureProvider, CaptureResult } from '../types';

const TITLE_LENGTH = 80;

function deriveTitle(description: string): string {
  const firstSentence = description.trim().split(/(?<=[.!?])\s/)[0] || description.trim();
  return firstSentence.length > TITLE_LENGTH ? `${firstSentence.slice(0, TITLE_LENGTH)}…` : firstSentence;
}

/**
 * A photo/image upload — description + best-effort OCR via VisionProvider.
 * `hint: 'SCREENSHOT'` routes to ScreenshotCaptureProvider instead; this is
 * the default for any other image file.
 */
export class ImageCaptureProvider implements CaptureProvider {
  readonly type = 'IMAGE' as const;

  /** Resolved lazily in capture(), not here — constructing the registry must not require ANTHROPIC_API_KEY just because an image provider exists in it. */
  constructor(private readonly vision?: VisionProvider) {}

  supports(input: CaptureInput): boolean {
    return Boolean(input.file?.mimeType.startsWith('image/')) && input.hint !== 'SCREENSHOT';
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const file = input.file!;
    const vision = this.vision ?? getVisionProvider();
    let result;
    try {
      result = await vision.describeImage({ buffer: file.buffer, mimeType: file.mimeType, kind: 'IMAGE' });
    } catch (err) {
      if (err instanceof VisionProviderError || err instanceof VisionResponseValidationError) {
        throw new CaptureProviderError(`Failed to analyze image "${file.filename}": ${err.message}`, err);
      }
      throw err;
    }

    return {
      type: 'IMAGE',
      title: input.title?.trim() || deriveTitle(result.description),
      content: result.extractedText ? `${result.description}\n\nText in image:\n${result.extractedText}` : result.description,
      metadata: {
        filename: file.filename,
        mimeType: file.mimeType,
        extractedText: result.extractedText || undefined,
      },
    };
  }
}

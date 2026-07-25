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
 * A screenshot upload — only matches when the caller explicitly passes
 * `hint: 'SCREENSHOT'` (see CaptureInput.hint for why this can't be inferred
 * from the image bytes alone). Uses VisionProvider with a screenshot-specific
 * prompt emphasizing which app/UI is shown and accurate text transcription,
 * since screenshots are usually saved for their text/UI content, not as a
 * photo subject.
 */
export class ScreenshotCaptureProvider implements CaptureProvider {
  readonly type = 'SCREENSHOT' as const;

  /** Resolved lazily in capture(), not here — constructing the registry must not require ANTHROPIC_API_KEY just because a screenshot provider exists in it. */
  constructor(private readonly vision?: VisionProvider) {}

  supports(input: CaptureInput): boolean {
    return Boolean(input.file?.mimeType.startsWith('image/')) && input.hint === 'SCREENSHOT';
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const file = input.file!;
    const vision = this.vision ?? getVisionProvider();
    let result;
    try {
      result = await vision.describeImage({ buffer: file.buffer, mimeType: file.mimeType, kind: 'SCREENSHOT' });
    } catch (err) {
      if (err instanceof VisionProviderError || err instanceof VisionResponseValidationError) {
        throw new CaptureProviderError(`Failed to analyze screenshot "${file.filename}": ${err.message}`, err);
      }
      throw err;
    }

    return {
      type: 'SCREENSHOT',
      title: input.title?.trim() || deriveTitle(result.description),
      content: result.extractedText ? `${result.description}\n\nText in screenshot:\n${result.extractedText}` : result.description,
      metadata: {
        filename: file.filename,
        mimeType: file.mimeType,
        extractedText: result.extractedText || undefined,
      },
    };
  }
}

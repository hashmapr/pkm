import type { CaptureInput, CaptureProvider, CaptureResult } from '../types';

const TITLE_LENGTH = 80;

function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0];
  return firstLine.length > TITLE_LENGTH ? `${firstLine.slice(0, TITLE_LENGTH)}…` : firstLine;
}

/**
 * The fallback provider: plain pasted or dictated text with no URL and no
 * file. Register this last so URL/file-specific providers (WebProvider,
 * YouTubeProvider, GitHubProvider, ImageProvider, PDFProvider — Sub-Phases
 * B/C) get first refusal.
 */
export class NoteCaptureProvider implements CaptureProvider {
  readonly type = 'NOTE' as const;

  supports(input: CaptureInput): boolean {
    return typeof input.text === 'string' && input.text.trim().length > 0 && !input.url && !input.file;
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const text = input.text!.trim();
    return {
      type: 'NOTE',
      title: input.title?.trim() || deriveTitle(text),
      content: text,
    };
  }
}

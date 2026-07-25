import pdfParse from 'pdf-parse';
import { CaptureProviderError } from '../errors';
import type { CaptureInput, CaptureProvider, CaptureResult } from '../types';

const MAX_CONTENT_CHARS = 60_000;

/**
 * Matches any uploaded PDF file, regardless of hint (hint only disambiguates
 * images). Pinned to pdf-parse@1.x deliberately — the 2.x line rebuilds on
 * pdf.js's newer ESM build, which crashes at module-evaluation time
 * ("Object.defineProperty called on non-object") when bundled into a Next.js
 * server route via webpack; confirmed with a real `npm run dev` request in
 * this environment, not just a lint/typecheck failure. 1.x is a plain CJS
 * wrapper around an older pdf.js and has none of that bundling trouble.
 */
export class PDFCaptureProvider implements CaptureProvider {
  readonly type = 'PDF' as const;

  supports(input: CaptureInput): boolean {
    return input.file?.mimeType === 'application/pdf';
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const file = input.file!;

    try {
      const result = await pdfParse(file.buffer);

      const title = input.title?.trim() || (result.info?.Title && result.info.Title.trim()) || file.filename;

      return {
        type: 'PDF',
        title,
        content: result.text.trim().slice(0, MAX_CONTENT_CHARS) || undefined,
        metadata: {
          filename: file.filename,
          pageCount: result.numpages,
          author: result.info?.Author || undefined,
        },
      };
    } catch (err) {
      throw new CaptureProviderError(`Failed to parse PDF "${file.filename}"`, err);
    }
  }
}

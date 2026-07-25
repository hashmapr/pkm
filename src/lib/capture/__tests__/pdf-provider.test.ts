import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureProviderError } from '../errors';

const pdfParseMock = vi.fn();

/**
 * Mocks pdf-parse rather than exercising the real parser — pdf-parse@2.x's
 * ESM/pdf.js build crashes when bundled into a Next.js server route
 * (confirmed with a real `npm run dev` request: "Object.defineProperty
 * called on non-object" at webpack module-eval time), so this provider is
 * pinned to pdf-parse@1.x (see pdf-provider.ts). 1.x is a stable plain-CJS
 * wrapper; a real PDF was still used to confirm end-to-end behavior via a
 * live smoke test against a running dev server (see ARCHITECTURE.md) rather
 * than in this automated suite, since hand-rolling a byte-perfect PDF
 * fixture proved fragile across pdf.js parser versions.
 */
vi.mock('pdf-parse', () => ({ default: pdfParseMock }));

const file = { buffer: Buffer.from('fake-pdf-bytes'), filename: 'doc.pdf', mimeType: 'application/pdf' };

describe('PDFCaptureProvider', () => {
  beforeEach(() => {
    pdfParseMock.mockReset();
  });

  it('supports application/pdf files, not other files', async () => {
    const { PDFCaptureProvider } = await import('../providers/pdf-provider');
    const provider = new PDFCaptureProvider();
    expect(provider.supports({ file })).toBe(true);
    expect(provider.supports({ file: { ...file, mimeType: 'image/png' } })).toBe(false);
    expect(provider.supports({ text: 'no file' })).toBe(false);
  });

  it('extracts text content, page count, title, and author', async () => {
    pdfParseMock.mockResolvedValue({ text: 'Hello PDF World', numpages: 3, info: { Title: 'Test Document', Author: 'PKM Test Suite' } });
    const { PDFCaptureProvider } = await import('../providers/pdf-provider');
    const provider = new PDFCaptureProvider();

    const result = await provider.capture({ file });

    expect(result.type).toBe('PDF');
    expect(result.title).toBe('Test Document');
    expect(result.content).toBe('Hello PDF World');
    expect(result.metadata).toEqual({ filename: 'doc.pdf', pageCount: 3, author: 'PKM Test Suite' });
  });

  it('falls back to the filename as title when the PDF has no Title metadata', async () => {
    pdfParseMock.mockResolvedValue({ text: 'No title here', numpages: 1, info: {} });
    const { PDFCaptureProvider } = await import('../providers/pdf-provider');
    const provider = new PDFCaptureProvider();

    const result = await provider.capture({ file: { ...file, filename: 'untitled.pdf' } });
    expect(result.title).toBe('untitled.pdf');
  });

  it('honors an explicit title override even when the PDF has its own Title', async () => {
    pdfParseMock.mockResolvedValue({ text: 'text', numpages: 1, info: { Title: 'PDF Title' } });
    const { PDFCaptureProvider } = await import('../providers/pdf-provider');
    const provider = new PDFCaptureProvider();

    const result = await provider.capture({ file, title: 'My Override' });
    expect(result.title).toBe('My Override');
  });

  it('truncates content at MAX_CONTENT_CHARS', async () => {
    pdfParseMock.mockResolvedValue({ text: 'x'.repeat(100_000), numpages: 1, info: {} });
    const { PDFCaptureProvider } = await import('../providers/pdf-provider');
    const provider = new PDFCaptureProvider();

    const result = await provider.capture({ file });
    expect(result.content!.length).toBe(60_000);
  });

  it('throws CaptureProviderError when parsing fails', async () => {
    pdfParseMock.mockRejectedValue(new Error('invalid PDF structure'));
    const { PDFCaptureProvider } = await import('../providers/pdf-provider');
    const provider = new PDFCaptureProvider();

    await expect(provider.capture({ file })).rejects.toThrow(CaptureProviderError);
  });
});

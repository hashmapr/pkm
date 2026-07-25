import { describe, expect, it } from 'vitest';
import { getCaptureRegistry } from '../index';

/**
 * Tests the actual exported registry's registration order — not just each
 * provider's supports() in isolation (see the individual provider test
 * files), but that getCaptureRegistry() wires them together correctly, so a
 * URL/file that could plausibly match more than one provider resolves to
 * the intended, more-specific one. Only exercises findProvider() (which
 * only calls supports()), never capture() — no network or vision-API access
 * needed.
 */
describe('getCaptureRegistry — real dispatch order', () => {
  const registry = getCaptureRegistry();

  it('dispatches a YouTube URL to YouTubeCaptureProvider, not the generic web fallback', () => {
    const provider = registry.findProvider({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(provider?.type).toBe('YOUTUBE');
  });

  it('dispatches a GitHub repo URL to GitHubCaptureProvider, not the generic web fallback', () => {
    const provider = registry.findProvider({ url: 'https://github.com/anthropics/claude-code' });
    expect(provider?.type).toBe('GITHUB');
  });

  it('dispatches an unrelated URL to WebCaptureProvider', () => {
    const provider = registry.findProvider({ url: 'https://example.com/some-article' });
    expect(provider?.type).toBe('LINK');
  });

  it('dispatches an image file with the screenshot hint to ScreenshotCaptureProvider', () => {
    const provider = registry.findProvider({
      file: { buffer: Buffer.from(''), filename: 'shot.png', mimeType: 'image/png' },
      hint: 'SCREENSHOT',
    });
    expect(provider?.type).toBe('SCREENSHOT');
  });

  it('dispatches an image file without the screenshot hint to ImageCaptureProvider', () => {
    const provider = registry.findProvider({
      file: { buffer: Buffer.from(''), filename: 'photo.png', mimeType: 'image/png' },
    });
    expect(provider?.type).toBe('IMAGE');
  });

  it('dispatches a PDF file to PDFCaptureProvider', () => {
    const provider = registry.findProvider({
      file: { buffer: Buffer.from(''), filename: 'doc.pdf', mimeType: 'application/pdf' },
    });
    expect(provider?.type).toBe('PDF');
  });

  it('dispatches plain text with no url and no file to NoteCaptureProvider', () => {
    const provider = registry.findProvider({ text: 'just a note' });
    expect(provider?.type).toBe('NOTE');
  });

  it('finds no provider for an empty input', () => {
    const provider = registry.findProvider({});
    expect(provider).toBeUndefined();
  });
});

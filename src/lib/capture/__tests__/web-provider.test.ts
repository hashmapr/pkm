import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureProviderError } from '../errors';
import { WebCaptureProvider } from '../providers/web-provider';

function fakeHtmlResponse(html: string, options: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: (name: string) => (name === 'content-type' ? options.contentType ?? 'text/html; charset=utf-8' : null) },
    text: async () => html,
  } as unknown as Response;
}

describe('WebCaptureProvider', () => {
  const provider = new WebCaptureProvider();
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports any input with a url', () => {
    expect(provider.supports({ url: 'https://example.com/post' })).toBe(true);
    expect(provider.supports({ text: 'no url here' })).toBe(false);
  });

  it('extracts title, author, description, and images and classifies short content as LINK', async () => {
    fetchMock.mockResolvedValue(
      fakeHtmlResponse(`
        <html><head>
          <title>Fallback Title</title>
          <meta property="og:title" content="A Short Page" />
          <meta name="author" content="Jane Doe" />
          <meta name="description" content="A brief description." />
          <meta property="og:image" content="/hero.png" />
        </head><body><main><p>Too short to be an article.</p></main></body></html>
      `),
    );

    const result = await provider.capture({ url: 'https://example.com/post' });

    expect(result.type).toBe('LINK');
    expect(result.title).toBe('A Short Page');
    expect(result.source).toBe('https://example.com/post');
    expect(result.metadata?.author).toBe('Jane Doe');
    expect(result.metadata?.description).toBe('A brief description.');
    expect(result.metadata?.images).toEqual(['https://example.com/hero.png']);
  });

  it('classifies long-form main content as ARTICLE', async () => {
    const longParagraph = '<p>' + 'Word '.repeat(200) + '</p>';
    fetchMock.mockResolvedValue(fakeHtmlResponse(`<html><body><article>${longParagraph}</article></body></html>`));

    const result = await provider.capture({ url: 'https://example.com/long' });
    expect(result.type).toBe('ARTICLE');
    expect(result.content!.length).toBeGreaterThan(600);
  });

  it('strips script/style/nav/footer content before extracting text', async () => {
    fetchMock.mockResolvedValue(
      fakeHtmlResponse(
        '<html><body><nav>Site Nav</nav><main><p>Real content.</p></main><footer>Footer junk</footer><script>var x = 1;</script></body></html>',
      ),
    );

    const result = await provider.capture({ url: 'https://example.com/page' });
    expect(result.content).toBe('Real content.');
  });

  it('honors an explicit title override', async () => {
    fetchMock.mockResolvedValue(fakeHtmlResponse('<html><head><title>Page Title</title></head><body></body></html>'));
    const result = await provider.capture({ url: 'https://example.com/page', title: 'My Custom Title' });
    expect(result.title).toBe('My Custom Title');
  });

  it('throws CaptureProviderError for a non-HTML content type', async () => {
    fetchMock.mockResolvedValue(fakeHtmlResponse('%PDF-1.4', { contentType: 'application/pdf' }));
    await expect(provider.capture({ url: 'https://example.com/doc.pdf' })).rejects.toThrow(CaptureProviderError);
  });

  it('throws CaptureProviderError on a non-ok HTTP response', async () => {
    fetchMock.mockResolvedValue(fakeHtmlResponse('not found', { ok: false, status: 404 }));
    await expect(provider.capture({ url: 'https://example.com/missing' })).rejects.toThrow(CaptureProviderError);
  });

  it('throws CaptureProviderError when the fetch itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(provider.capture({ url: 'https://example.com/unreachable' })).rejects.toThrow(CaptureProviderError);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureProviderError } from '../errors';
import { YouTubeCaptureProvider } from '../providers/youtube-provider';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function textResponse(body: string, ok = true, status = 200) {
  return { ok, status, text: async () => body } as unknown as Response;
}

describe('YouTubeCaptureProvider', () => {
  const provider = new YouTubeCaptureProvider();
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports standard watch, youtu.be, and shorts URLs, not unrelated urls', () => {
    expect(provider.supports({ url: 'https://www.youtube.com/watch?v=abc12345678' })).toBe(true);
    expect(provider.supports({ url: 'https://youtu.be/abc12345678' })).toBe(true);
    expect(provider.supports({ url: 'https://www.youtube.com/shorts/abc12345678' })).toBe(true);
    expect(provider.supports({ url: 'https://example.com/watch?v=abc' })).toBe(false);
    expect(provider.supports({ text: 'no url' })).toBe(false);
  });

  it('captures title/author from oEmbed and transcript + chapters from the watch page', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/oembed')) {
        return jsonResponse({ title: 'How Agents Work', author_name: 'AI Channel', thumbnail_url: 'https://img/thumb.jpg' });
      }
      if (url.includes('watch?v=')) {
        const html =
          '<meta name="description" content="Great video.\n0:00 Intro\n1:30 Deep dive">' +
          '"captionTracks":[{"baseUrl":"https://timedtext/en","languageCode":"en"}]';
        return textResponse(html);
      }
      if (url.includes('timedtext')) {
        return textResponse('<transcript><text start="0">Hello there</text><text start="1">welcome</text></transcript>');
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await provider.capture({ url: 'https://www.youtube.com/watch?v=abc12345678' });

    expect(result.type).toBe('YOUTUBE');
    expect(result.title).toBe('How Agents Work');
    expect(result.content).toBe('Hello there welcome');
    expect(result.metadata?.author).toBe('AI Channel');
    expect(result.metadata?.videoId).toBe('abc12345678');
    expect(result.metadata?.transcriptAvailable).toBe(true);
    expect(result.metadata?.chapters).toEqual(['0:00 Intro', '1:30 Deep dive']);
  });

  it('still succeeds with just oEmbed metadata when the transcript page fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/oembed')) {
        return jsonResponse({ title: 'A Video', author_name: 'Someone' });
      }
      throw new Error('network down');
    });

    const result = await provider.capture({ url: 'https://youtu.be/abc12345678' });
    expect(result.title).toBe('A Video');
    expect(result.metadata?.transcriptAvailable).toBe(false);
    expect(result.content).toBeUndefined();
  });

  it('throws CaptureProviderError when oEmbed lookup fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not found' }, false, 404));
    await expect(provider.capture({ url: 'https://www.youtube.com/watch?v=doesnotexist' })).rejects.toThrow(
      CaptureProviderError,
    );
  });

  it('honors an explicit title override', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/oembed')) return jsonResponse({ title: 'Original Title' });
      throw new Error('network down');
    });
    const result = await provider.capture({ url: 'https://youtu.be/abc12345678', title: 'My Title' });
    expect(result.title).toBe('My Title');
  });
});

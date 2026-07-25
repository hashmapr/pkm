import { CaptureProviderError } from '../errors';
import type { CaptureInput, CaptureProvider, CaptureResult } from '../types';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; PKM-Capture/1.0; +personal knowledge capture tool)';

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

function extractVideoId(rawUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') {
    return url.pathname.slice(1).split('/')[0] || undefined;
  }
  if (host === 'youtube.com') {
    if (url.pathname === '/watch') return url.searchParams.get('v') ?? undefined;
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
    if (url.pathname.startsWith('/live/')) return url.pathname.split('/')[2];
  }
  return undefined;
}

function decodeEntities(text: string): string {
  return text
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Best-effort transcript + description extraction. There is no supported
 * public API for either (YouTube Data API's captions.download requires
 * OAuth as the video's owner) — this scrapes the watch page's embedded
 * player-response JSON for a caption track URL and the page's description
 * meta tag, the same approach most unofficial "youtube transcript" packages
 * use. It can break if YouTube changes its markup; failures here are
 * swallowed, not thrown, since a transcript is a bonus, not the capture's
 * reason to exist (the oEmbed title/author is).
 */
async function fetchTranscriptAndDescription(
  videoId: string,
): Promise<{ transcript?: string; description?: string; chapters?: string[] }> {
  try {
    const response = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}`);
    if (!response.ok) return {};
    const html = await response.text();

    const descriptionMatch = html.match(/<meta name="description" content="([^"]*)"/);
    const description = descriptionMatch ? decodeEntities(descriptionMatch[1]) : undefined;

    const chapters = description
      ?.split('\n')
      .filter((line) => /^\(?(\d{1,2}:)?\d{1,2}:\d{2}\)?\s+\S/.test(line.trim()))
      .slice(0, 50);

    const tracksMatch = html.match(/"captionTracks":(\[.*?\])/);
    if (!tracksMatch) return { description, chapters };

    let tracks: Array<{ baseUrl: string; languageCode?: string }>;
    try {
      tracks = JSON.parse(decodeEntities(tracksMatch[1]));
    } catch {
      return { description, chapters };
    }

    const track = tracks.find((t) => t.languageCode?.startsWith('en')) ?? tracks[0];
    if (!track?.baseUrl) return { description, chapters };

    const transcriptResponse = await fetchWithTimeout(track.baseUrl);
    if (!transcriptResponse.ok) return { description, chapters };
    const xml = await transcriptResponse.text();
    const transcript = decodeEntities(xml.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();

    return { transcript: transcript || undefined, description, chapters };
  } catch {
    return {};
  }
}

/**
 * Register before WebCaptureProvider so YouTube links aren't treated as
 * generic webpages.
 */
export class YouTubeCaptureProvider implements CaptureProvider {
  readonly type = 'YOUTUBE' as const;

  supports(input: CaptureInput): boolean {
    if (!input.url) return false;
    return extractVideoId(input.url) !== undefined;
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const url = input.url!.trim();
    const videoId = extractVideoId(url);
    if (!videoId) throw new CaptureProviderError(`Could not extract a video ID from ${url}`);

    let oembed: OEmbedResponse;
    try {
      const response = await fetchWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      );
      if (!response.ok) {
        throw new CaptureProviderError(`YouTube oEmbed lookup for ${url} returned HTTP ${response.status}`);
      }
      oembed = await response.json();
    } catch (err) {
      if (err instanceof CaptureProviderError) throw err;
      throw new CaptureProviderError(`Failed to fetch YouTube metadata for ${url}`, err);
    }

    const { transcript, description, chapters } = await fetchTranscriptAndDescription(videoId);

    return {
      type: 'YOUTUBE',
      title: input.title?.trim() || oembed.title || url,
      source: url,
      content: transcript || description,
      metadata: {
        videoId,
        author: oembed.author_name,
        authorUrl: oembed.author_url,
        thumbnailUrl: oembed.thumbnail_url,
        description,
        chapters: chapters?.length ? chapters : undefined,
        transcriptAvailable: Boolean(transcript),
      },
    };
  }
}

import * as cheerio from 'cheerio';
import { CaptureProviderError } from '../errors';
import type { CaptureInput, CaptureProvider, CaptureResult } from '../types';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_CHARS = 40_000;
const ARTICLE_THRESHOLD_CHARS = 600;
const MAX_IMAGES = 5;
const USER_AGENT =
  'Mozilla/5.0 (compatible; PKM-Capture/1.0; +personal knowledge capture tool)';

function collapseWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function resolveUrl(maybeRelative: string, base: string): string | undefined {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * The generic fallback for any input with a URL that no more specific
 * provider (YouTube, GitHub) claims. Register this after those two so a
 * youtube.com or github.com link doesn't get treated as a plain webpage.
 *
 * `type` is nominally LINK, but capture() reclassifies to ARTICLE when the
 * extracted main-content text clears ARTICLE_THRESHOLD_CHARS — long-form
 * content vs. a bare link is only knowable after fetching the page, and
 * nothing reads `provider.type` as a contract on capture()'s actual output.
 */
export class WebCaptureProvider implements CaptureProvider {
  readonly type = 'LINK' as const;

  supports(input: CaptureInput): boolean {
    return typeof input.url === 'string' && input.url.trim().length > 0;
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const url = input.url!.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
      });
    } catch (err) {
      throw new CaptureProviderError(`Failed to fetch ${url}`, err);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new CaptureProviderError(`Fetching ${url} returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new CaptureProviderError(
        `Content type "${contentType || 'unknown'}" isn't supported for web capture yet (only HTML pages)`,
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const ogTitle = $('meta[property="og:title"]').attr('content');
    const title = (ogTitle || $('title').first().text() || url).trim();

    const author = ($('meta[name="author"]').attr('content') || $('meta[property="article:author"]').attr('content'))?.trim();
    const description = ($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'))?.trim();
    const siteName = $('meta[property="og:site_name"]').attr('content')?.trim();

    const images = new Set<string>();
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      const resolved = resolveUrl(ogImage, url);
      if (resolved) images.add(resolved);
    }
    $('img[src]').each((_, el) => {
      if (images.size >= MAX_IMAGES) return;
      const src = $(el).attr('src');
      if (!src) return;
      const resolved = resolveUrl(src, url);
      if (resolved) images.add(resolved);
    });

    $('script, style, nav, header, footer, aside, noscript').remove();
    const contentRoot = $('article').length ? $('article') : $('main').length ? $('main') : $('body');
    const rawText = contentRoot.text();
    const text = collapseWhitespace(rawText).slice(0, MAX_CONTENT_CHARS);

    return {
      type: text.length >= ARTICLE_THRESHOLD_CHARS ? 'ARTICLE' : 'LINK',
      title: input.title?.trim() || title,
      source: url,
      content: text || description || undefined,
      metadata: {
        author: author || undefined,
        description: description || undefined,
        siteName: siteName || undefined,
        images: Array.from(images),
      },
    };
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureProviderError } from '../errors';
import { GitHubCaptureProvider } from '../providers/github-provider';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

function textResponse(body: string, ok = true, status = 200) {
  return { ok, status, text: async () => body } as unknown as Response;
}

const repoInfo = {
  full_name: 'anthropics/claude-code',
  html_url: 'https://github.com/anthropics/claude-code',
  description: 'Claude Code CLI',
  language: 'TypeScript',
  stargazers_count: 1000,
  topics: ['ai', 'cli'],
  default_branch: 'main',
};

describe('GitHubCaptureProvider', () => {
  const provider = new GitHubCaptureProvider();
  const fetchMock = vi.fn();
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  });

  it('supports github.com repo URLs, not unrelated urls', () => {
    expect(provider.supports({ url: 'https://github.com/anthropics/claude-code' })).toBe(true);
    expect(provider.supports({ url: 'https://github.com/anthropics/claude-code/tree/main/src' })).toBe(true);
    expect(provider.supports({ url: 'https://github.com/anthropics' })).toBe(false);
    expect(provider.supports({ url: 'https://gitlab.com/foo/bar' })).toBe(false);
  });

  it('combines repo info, languages, and README into a capture result', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repos/anthropics/claude-code')) return jsonResponse(repoInfo);
      if (url.endsWith('/languages')) return jsonResponse({ TypeScript: 900, JavaScript: 100 });
      if (url.endsWith('/readme')) return textResponse('# claude-code\n\nA CLI tool.');
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await provider.capture({ url: 'https://github.com/anthropics/claude-code' });

    expect(result.type).toBe('GITHUB');
    expect(result.title).toBe('anthropics/claude-code');
    expect(result.content).toBe('# claude-code\n\nA CLI tool.');
    expect(result.metadata?.languages).toEqual({ TypeScript: 900, JavaScript: 100 });
    expect(result.metadata?.stars).toBe(1000);
    expect(result.metadata?.topics).toEqual(['ai', 'cli']);
  });

  it('falls back to the repo description when the README fetch fails, without failing capture', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repos/anthropics/claude-code')) return jsonResponse(repoInfo);
      if (url.endsWith('/languages')) return jsonResponse({}, false, 500);
      if (url.endsWith('/readme')) return textResponse('', false, 404);
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await provider.capture({ url: 'https://github.com/anthropics/claude-code' });
    expect(result.content).toBe('Claude Code CLI');
    expect(result.metadata?.languages).toBeUndefined();
  });

  it('throws CaptureProviderError when the repo does not exist', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 404));
    await expect(provider.capture({ url: 'https://github.com/nobody/nothing' })).rejects.toThrow(
      CaptureProviderError,
    );
  });

  it('sends an Authorization header when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repos/anthropics/claude-code')) return jsonResponse(repoInfo);
      if (url.endsWith('/languages')) return jsonResponse({});
      if (url.endsWith('/readme')) return textResponse('readme text');
      throw new Error(`unexpected fetch: ${url}`);
    });

    await provider.capture({ url: 'https://github.com/anthropics/claude-code' });

    const repoCallHeaders = fetchMock.mock.calls[0][1].headers;
    expect(repoCallHeaders.Authorization).toBe('Bearer test-token');
  });

  it('honors an explicit title override', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repos/anthropics/claude-code')) return jsonResponse(repoInfo);
      if (url.endsWith('/languages')) return jsonResponse({});
      if (url.endsWith('/readme')) return textResponse('readme');
      throw new Error(`unexpected fetch: ${url}`);
    });
    const result = await provider.capture({ url: 'https://github.com/anthropics/claude-code', title: 'Custom' });
    expect(result.title).toBe('Custom');
  });
});

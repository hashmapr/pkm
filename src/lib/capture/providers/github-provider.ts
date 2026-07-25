import { CaptureProviderError } from '../errors';
import type { CaptureInput, CaptureProvider, CaptureResult } from '../types';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_README_CHARS = 40_000;

interface RepoInfo {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  topics?: string[];
  default_branch: string;
}

function extractRepoPath(rawUrl: string): { owner: string; repo: string } | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (url.hostname.replace(/^www\./, '') !== 'github.com') return undefined;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return undefined;
  const [owner, repo] = segments;
  return { owner, repo: repo.replace(/\.git$/, '') };
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Register before WebCaptureProvider so github.com links get repo-specific
 * extraction (README, languages, stars) instead of generic webpage scraping.
 * Works unauthenticated for public repos (subject to GitHub's low anonymous
 * rate limit); set GITHUB_TOKEN to raise the limit or reach private repos
 * the token has access to.
 */
export class GitHubCaptureProvider implements CaptureProvider {
  readonly type = 'GITHUB' as const;

  supports(input: CaptureInput): boolean {
    if (!input.url) return false;
    return extractRepoPath(input.url) !== undefined;
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const url = input.url!.trim();
    const path = extractRepoPath(url);
    if (!path) throw new CaptureProviderError(`Could not extract an owner/repo from ${url}`);
    const { owner, repo } = path;
    const headers = authHeaders();

    let repoInfo: RepoInfo;
    try {
      const response = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, headers);
      if (response.status === 404) {
        throw new CaptureProviderError(`GitHub repository ${owner}/${repo} was not found (or is private without GITHUB_TOKEN access)`);
      }
      if (!response.ok) {
        throw new CaptureProviderError(`GitHub API returned HTTP ${response.status} for ${owner}/${repo}`);
      }
      repoInfo = await response.json();
    } catch (err) {
      if (err instanceof CaptureProviderError) throw err;
      throw new CaptureProviderError(`Failed to fetch GitHub repository metadata for ${owner}/${repo}`, err);
    }

    const languages = await fetchLanguages(owner, repo, headers);
    const readme = await fetchReadme(owner, repo, headers);

    return {
      type: 'GITHUB',
      title: input.title?.trim() || repoInfo.full_name,
      source: repoInfo.html_url,
      content: readme || repoInfo.description || undefined,
      metadata: {
        description: repoInfo.description ?? undefined,
        primaryLanguage: repoInfo.language ?? undefined,
        languages,
        stars: repoInfo.stargazers_count,
        topics: repoInfo.topics ?? [],
        defaultBranch: repoInfo.default_branch,
      },
    };
  }
}

async function fetchLanguages(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<Record<string, number> | undefined> {
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/languages`, headers);
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

async function fetchReadme(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      ...headers,
      Accept: 'application/vnd.github.raw+json',
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    return text.slice(0, MAX_README_CHARS);
  } catch {
    return undefined;
  }
}

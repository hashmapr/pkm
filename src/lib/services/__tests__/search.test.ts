import { describe, expect, it } from 'vitest';
import { buildHighlight, hasSearchableQuery } from '../search';

describe('hasSearchableQuery — empty queries', () => {
  it('returns false for undefined, null, and blank strings', () => {
    expect(hasSearchableQuery(undefined)).toBe(false);
    expect(hasSearchableQuery(null)).toBe(false);
    expect(hasSearchableQuery('')).toBe(false);
    expect(hasSearchableQuery('   ')).toBe(false);
  });

  it('returns true for a real query', () => {
    expect(hasSearchableQuery('AI agents')).toBe(true);
  });
});

describe('buildHighlight', () => {
  it('prefers summary over content', () => {
    expect(buildHighlight('The summary', 'The content')).toBe('The summary');
  });

  it('falls back to content when there is no summary', () => {
    expect(buildHighlight(null, 'The content')).toBe('The content');
  });

  it('returns an empty string when neither is present', () => {
    expect(buildHighlight(null, null)).toBe('');
  });

  it('truncates long text with an ellipsis', () => {
    const long = 'x'.repeat(400);
    const highlight = buildHighlight(long, null);
    expect(highlight.endsWith('…')).toBe(true);
    expect(highlight.length).toBe(301);
  });
});

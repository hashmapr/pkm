import { describe, expect, it } from 'vitest';
import { normalizeTagNames } from '../tags';

describe('normalizeTagNames — duplicate tags', () => {
  it('de-duplicates case-insensitively', () => {
    expect(normalizeTagNames(['AI', 'ai', 'Ai', 'agents'])).toEqual(['ai', 'agents']);
  });

  it('trims whitespace before comparing', () => {
    expect(normalizeTagNames([' ai ', 'ai'])).toEqual(['ai']);
  });

  it('drops empty and whitespace-only entries', () => {
    expect(normalizeTagNames(['ai', '', '   '])).toEqual(['ai']);
  });

  it('preserves first-seen order', () => {
    expect(normalizeTagNames(['agents', 'ai', 'Agents'])).toEqual(['agents', 'ai']);
  });

  it('returns an empty array for an empty input', () => {
    expect(normalizeTagNames([])).toEqual([]);
  });
});

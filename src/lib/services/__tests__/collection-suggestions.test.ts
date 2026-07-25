import { describe, expect, it } from 'vitest';
import { clusterBySimilarity, deriveClusterName } from '../collection-suggestions';

describe('clusterBySimilarity', () => {
  it('groups items connected by a similarity above the threshold', () => {
    const clusters = clusterBySimilarity(
      ['a', 'b', 'c'],
      [
        { itemA: 'a', itemB: 'b', similarity: 0.9 },
        { itemA: 'b', itemB: 'c', similarity: 0.8 },
      ],
    );
    expect(clusters).toEqual([['a', 'b', 'c']]);
  });

  it('excludes isolated items with no similar pair (cluster size below minimum)', () => {
    const clusters = clusterBySimilarity(
      ['a', 'b', 'c'],
      [{ itemA: 'a', itemB: 'b', similarity: 0.9 }],
    );
    expect(clusters).toEqual([['a', 'b']]);
  });

  it('does not group pairs below the threshold', () => {
    const clusters = clusterBySimilarity(
      ['a', 'b'],
      [{ itemA: 'a', itemB: 'b', similarity: 0.4 }],
      0.6,
    );
    expect(clusters).toEqual([]);
  });

  it('respects a custom threshold and minimum cluster size', () => {
    const clusters = clusterBySimilarity(
      ['a', 'b', 'c', 'd'],
      [
        { itemA: 'a', itemB: 'b', similarity: 0.55 },
        { itemA: 'c', itemB: 'd', similarity: 0.9 },
      ],
      0.5,
      2,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters).toContainEqual(['a', 'b']);
    expect(clusters).toContainEqual(['c', 'd']);
  });

  it('produces disjoint clusters for unrelated groups of items', () => {
    const clusters = clusterBySimilarity(
      ['a', 'b', 'c', 'd', 'e'],
      [
        { itemA: 'a', itemB: 'b', similarity: 0.9 },
        { itemA: 'd', itemB: 'e', similarity: 0.9 },
      ],
    );
    expect(clusters).toHaveLength(2);
    const sorted = clusters.map((c) => [...c].sort());
    expect(sorted).toContainEqual(['a', 'b']);
    expect(sorted).toContainEqual(['d', 'e']);
  });

  it('returns no clusters when nothing is similar enough', () => {
    const clusters = clusterBySimilarity(['a', 'b'], []);
    expect(clusters).toEqual([]);
  });
});

describe('deriveClusterName', () => {
  it('names the cluster after a tag shared by a majority of members', () => {
    const name = deriveClusterName([['ai', 'agents'], ['ai', 'startups'], ['ai']]);
    expect(name).toBe('Ai');
  });

  it('returns undefined when no tag reaches a majority', () => {
    const name = deriveClusterName([['ai'], ['startups'], ['research']]);
    expect(name).toBeUndefined();
  });

  it('returns undefined for members with no tags at all', () => {
    expect(deriveClusterName([[], []])).toBeUndefined();
  });

  it('capitalizes the winning tag', () => {
    const name = deriveClusterName([['langgraph'], ['langgraph'], ['other']]);
    expect(name).toBe('Langgraph');
  });
});

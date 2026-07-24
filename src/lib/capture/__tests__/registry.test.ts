import { describe, expect, it } from 'vitest';
import { CaptureProviderRegistry } from '../registry';
import { NoCaptureProviderError } from '../errors';
import { NoteCaptureProvider } from '../providers/note-provider';
import type { CaptureInput, CaptureProvider, CaptureResult } from '../types';

function fakeProvider(type: CaptureResult['type'], supports: (input: CaptureInput) => boolean): CaptureProvider {
  return {
    type,
    supports,
    capture: async () => ({ type, title: `${type} result` }),
  };
}

describe('CaptureProviderRegistry', () => {
  it('dispatches to the first provider whose supports() matches', async () => {
    const registry = new CaptureProviderRegistry();
    registry.register(fakeProvider('GITHUB', (input) => Boolean(input.url?.includes('github.com'))));
    registry.register(fakeProvider('LINK', () => true));

    const result = await registry.capture({ url: 'https://github.com/foo/bar' });
    expect(result.type).toBe('GITHUB');
  });

  it('respects registration order — first match wins even if a later provider would also match', async () => {
    const registry = new CaptureProviderRegistry();
    registry.register(fakeProvider('YOUTUBE', () => true));
    registry.register(fakeProvider('LINK', () => true));

    const result = await registry.capture({ url: 'https://example.com' });
    expect(result.type).toBe('YOUTUBE');
  });

  it('throws NoCaptureProviderError when nothing supports the input', async () => {
    const registry = new CaptureProviderRegistry();
    registry.register(fakeProvider('GITHUB', () => false));

    await expect(registry.capture({ url: 'https://example.com' })).rejects.toThrow(NoCaptureProviderError);
  });

  it('findProvider returns undefined instead of throwing', () => {
    const registry = new CaptureProviderRegistry();
    expect(registry.findProvider({ text: 'hello' })).toBeUndefined();
  });
});

describe('NoteCaptureProvider', () => {
  const provider = new NoteCaptureProvider();

  it('supports plain text with no url and no file', () => {
    expect(provider.supports({ text: 'a note' })).toBe(true);
  });

  it('does not support input with a url', () => {
    expect(provider.supports({ text: 'a note', url: 'https://example.com' })).toBe(false);
  });

  it('does not support input with a file', () => {
    expect(
      provider.supports({ text: 'a note', file: { buffer: Buffer.from(''), filename: 'a', mimeType: 'text/plain' } }),
    ).toBe(false);
  });

  it('does not support blank or missing text', () => {
    expect(provider.supports({ text: '   ' })).toBe(false);
    expect(provider.supports({})).toBe(false);
  });

  it('captures as a NOTE using the given title when provided', async () => {
    const result = await provider.capture({ text: 'Some content here', title: 'My note' });
    expect(result).toEqual({ type: 'NOTE', title: 'My note', content: 'Some content here' });
  });

  it('derives a title from the first line of text when none is given', async () => {
    const result = await provider.capture({ text: 'First line\nSecond line' });
    expect(result.title).toBe('First line');
  });

  it('truncates a very long first line for the derived title', async () => {
    const longLine = 'x'.repeat(200);
    const result = await provider.capture({ text: longLine });
    expect(result.title.length).toBe(81); // 80 chars + ellipsis
    expect(result.title.endsWith('…')).toBe(true);
  });
});

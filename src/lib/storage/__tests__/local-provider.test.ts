import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageProvider } from '../local-provider';
import { StorageError } from '../errors';

describe('LocalStorageProvider', () => {
  let baseDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), 'pkm-storage-test-'));
    provider = new LocalStorageProvider({ baseDir, publicUrlPrefix: '/api/audio/file' });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('round-trips an uploaded file through read', async () => {
    const buffer = Buffer.from('fake audio bytes');
    const { key } = await provider.upload({ buffer, filename: 'note.mp3', mimeType: 'audio/mpeg' });

    expect(key).toMatch(/\.mp3$/);
    const readBack = await provider.read(key);
    expect(readBack.equals(buffer)).toBe(true);
  });

  it('produces a servable URL from the key', async () => {
    const { key } = await provider.upload({ buffer: Buffer.from('x'), filename: 'a.wav', mimeType: 'audio/wav' });
    expect(provider.getUrl(key)).toBe(`/api/audio/file/${key}`);
  });

  it('delete removes the file', async () => {
    const { key } = await provider.upload({ buffer: Buffer.from('x'), filename: 'a.mp3', mimeType: 'audio/mpeg' });
    await provider.delete(key);
    await expect(provider.read(key)).rejects.toThrow(StorageError);
  });

  it('rejects a key containing a path traversal segment', async () => {
    await expect(provider.read('../../etc/passwd')).rejects.toThrow(StorageError);
    expect(() => provider.getUrl('../../etc/passwd')).toThrow(StorageError);
  });

  it('rejects a key containing a slash', async () => {
    await expect(provider.read('sub/dir/file.mp3')).rejects.toThrow(StorageError);
  });
});

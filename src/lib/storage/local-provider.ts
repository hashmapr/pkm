import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StorageError } from './errors';
import type { StorageProvider, UploadInput, UploadResult } from './types';

const SAFE_KEY_PATTERN = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9]{1,10})?$/;

function sanitizeExtension(filename: string): string {
  const ext = path.extname(filename).replace(/[^a-zA-Z0-9.]/g, '');
  return /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext : '';
}

/** Guards against path traversal — a key must be a bare filename, never a path. */
function assertSafeKey(key: string): void {
  if (!SAFE_KEY_PATTERN.test(key)) {
    throw new StorageError(`Invalid storage key: ${key}`);
  }
}

export interface LocalStorageProviderOptions {
  baseDir: string;
  /** URL prefix used by getUrl(); should match the route that serves files by key. */
  publicUrlPrefix: string;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;
  private readonly publicUrlPrefix: string;

  constructor(options: LocalStorageProviderOptions) {
    this.baseDir = options.baseDir;
    this.publicUrlPrefix = options.publicUrlPrefix;
  }

  private resolvePath(key: string): string {
    assertSafeKey(key);
    return path.join(this.baseDir, key);
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const key = `${randomUUID()}${sanitizeExtension(input.filename)}`;
    try {
      await mkdir(this.baseDir, { recursive: true });
      await writeFile(this.resolvePath(key), input.buffer);
    } catch (err) {
      throw new StorageError('Failed to write file to local storage', err);
    }
    return { key };
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.resolvePath(key), { force: true });
    } catch (err) {
      throw new StorageError('Failed to delete file from local storage', err);
    }
  }

  getUrl(key: string): string {
    assertSafeKey(key);
    return `${this.publicUrlPrefix}/${encodeURIComponent(key)}`;
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolvePath(key));
    } catch (err) {
      throw new StorageError('Failed to read file from local storage', err);
    }
  }
}

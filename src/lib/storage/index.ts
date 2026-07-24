import path from 'node:path';
import { LocalStorageProvider } from './local-provider';
import type { StorageProvider } from './types';

let cachedProvider: LocalStorageProvider | undefined;

/**
 * Returns the configured StorageProvider. Swapping to S3/R2 later means
 * changing this factory (and adding a new provider class) — no call site
 * changes.
 */
export function getStorageProvider(): StorageProvider {
  if (!cachedProvider) {
    cachedProvider = new LocalStorageProvider({
      baseDir: path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? 'uploads'),
      publicUrlPrefix: '/api/audio/file',
    });
  }
  return cachedProvider;
}

export type { StorageProvider } from './types';
export { StorageError } from './errors';

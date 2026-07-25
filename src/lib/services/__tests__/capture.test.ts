import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  savedItem: { create: vi.fn(), update: vi.fn() },
  processingJob: { create: vi.fn() },
  attachment: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

const { captureItem, MAX_CAPTURE_FILE_BYTES } = await import('../capture');
const { CaptureProviderError } = await import('@/lib/capture/errors');
import type { CaptureProviderRegistry } from '@/lib/capture';
import type { StorageProvider } from '@/lib/storage/types';

function notImplemented(): never {
  throw new Error('not implemented in fake — should not have been called');
}

function fakeRegistry(overrides: Partial<CaptureProviderRegistry> = {}): CaptureProviderRegistry {
  return { findProvider: notImplemented, capture: notImplemented, ...overrides } as CaptureProviderRegistry;
}

function fakeStorage(overrides: Partial<StorageProvider> = {}): StorageProvider {
  return { upload: notImplemented, delete: notImplemented, getUrl: notImplemented, read: notImplemented, ...overrides };
}

describe('captureItem — file size validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an empty file before dispatching to any provider', async () => {
    const registry = fakeRegistry();
    const storage = fakeStorage();

    await expect(
      captureItem(
        'user-1',
        { file: { buffer: Buffer.alloc(0), filename: 'empty.png', mimeType: 'image/png' } },
        registry,
        storage,
      ),
    ).rejects.toThrow(CaptureProviderError);
  });

  it('rejects a file over MAX_CAPTURE_FILE_BYTES before dispatching to any provider', async () => {
    const registry = fakeRegistry();
    const storage = fakeStorage();
    const oversized = Buffer.alloc(MAX_CAPTURE_FILE_BYTES + 1);

    await expect(
      captureItem('user-1', { file: { buffer: oversized, filename: 'big.png', mimeType: 'image/png' } }, registry, storage),
    ).rejects.toThrow(CaptureProviderError);
  });
});

describe('captureItem — storage is only touched for file-based captures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.savedItem.create.mockResolvedValue({ id: 'item-1', attachments: [] });
    dbMock.$transaction.mockResolvedValue([{ id: 'job-1', status: 'PENDING' }, { id: 'item-1' }]);
  });

  it('never calls storage.upload for a url/text capture', async () => {
    const registry = fakeRegistry({
      capture: async () => ({ type: 'NOTE', title: 'A note' }),
    });
    const storage = fakeStorage(); // upload throws if called

    const item = await captureItem('user-1', { text: 'hello' }, registry, storage);
    expect(item.id).toBe('item-1');
  });

  it('uploads the file and creates an Attachment for a file-based capture', async () => {
    dbMock.attachment.create.mockResolvedValue({ id: 'att-1', storagePath: 'key-1', mimeType: 'image/png', sizeBytes: 3 });
    const registry = fakeRegistry({
      capture: async () => ({ type: 'IMAGE', title: 'A photo', content: 'A cat' }),
    });
    const storage = fakeStorage({ upload: async () => ({ key: 'key-1' }) });

    const item = await captureItem(
      'user-1',
      { file: { buffer: Buffer.from('abc'), filename: 'photo.png', mimeType: 'image/png' } },
      registry,
      storage,
    );

    expect(item.attachments).toEqual([{ id: 'att-1', storagePath: 'key-1', mimeType: 'image/png', sizeBytes: 3 }]);
    expect(dbMock.attachment.create).toHaveBeenCalledWith({
      data: { savedItemId: 'item-1', storagePath: 'key-1', mimeType: 'image/png', sizeBytes: 3 },
    });
  });
});

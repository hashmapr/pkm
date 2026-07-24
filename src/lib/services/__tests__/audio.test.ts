import { describe, expect, it, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  savedItem: { findFirst: vi.fn(), update: vi.fn() },
  audioAttachment: { update: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

const { runTranscriptionSafely, transcribeSavedItemAudio, MissingAudioAttachmentError } = await import(
  '../audio'
);
const { SavedItemNotFoundError } = await import('../processing');
const { TranscriptionProviderError } = await import('@/lib/transcription/errors');
import type { TranscriptionProvider } from '@/lib/transcription/types';
import type { StorageProvider } from '@/lib/storage/types';

function notImplemented(): never {
  throw new Error('not implemented in fake');
}

function fakeTranscriptionProvider(overrides: Partial<TranscriptionProvider>): TranscriptionProvider {
  return { transcribe: notImplemented, ...overrides };
}

function fakeStorage(overrides: Partial<StorageProvider>): StorageProvider {
  return {
    upload: notImplemented,
    delete: notImplemented,
    getUrl: notImplemented,
    read: notImplemented,
    ...overrides,
  };
}

describe('runTranscriptionSafely — successful and failed transcription', () => {
  const input = { buffer: Buffer.from('audio'), filename: 'note.mp3', mimeType: 'audio/mpeg' };

  it('returns success with the transcript on a successful transcription', async () => {
    const provider = fakeTranscriptionProvider({
      transcribe: async () => ({ text: 'hello world', durationSeconds: 12 }),
    });
    const outcome = await runTranscriptionSafely(provider, input);
    expect(outcome).toEqual({ success: true, data: { text: 'hello world', durationSeconds: 12 } });
  });

  it('returns a failure outcome when the provider throws TranscriptionProviderError', async () => {
    const provider = fakeTranscriptionProvider({
      transcribe: async () => {
        throw new TranscriptionProviderError('Whisper transcription request failed');
      },
    });
    const outcome = await runTranscriptionSafely(provider, input);
    expect(outcome.success).toBe(false);
    if (!outcome.success) expect(outcome.error).toMatch(/Whisper transcription request failed/);
  });

  it('returns a failure outcome instead of throwing for an unexpected error', async () => {
    const provider = fakeTranscriptionProvider({
      transcribe: async () => {
        throw new Error('network timeout');
      },
    });
    const outcome = await runTranscriptionSafely(provider, input);
    expect(outcome).toEqual({ success: false, error: 'network timeout' });
  });
});

describe('transcribeSavedItemAudio — missing audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws SavedItemNotFoundError when the item does not exist or is not owned', async () => {
    dbMock.savedItem.findFirst.mockResolvedValue(null);
    const provider = fakeTranscriptionProvider({});
    const storage = fakeStorage({});

    await expect(transcribeSavedItemAudio('user-1', 'item-1', provider, storage)).rejects.toThrow(
      SavedItemNotFoundError,
    );
  });

  it('throws MissingAudioAttachmentError when the item has no audio attachment', async () => {
    dbMock.savedItem.findFirst.mockResolvedValue({ id: 'item-1', userId: 'user-1', audioAttachment: null });
    const provider = fakeTranscriptionProvider({});
    const storage = fakeStorage({});

    await expect(transcribeSavedItemAudio('user-1', 'item-1', provider, storage)).rejects.toThrow(
      MissingAudioAttachmentError,
    );
  });
});

import { AudioAttachment } from '@prisma/client';
import { db } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';
import type { StorageProvider } from '@/lib/storage/types';
import { getTranscriptionProvider } from '@/lib/transcription';
import { TranscriptionProviderError } from '@/lib/transcription/errors';
import type { TranscriptionInput, TranscriptionProvider, TranscriptionResult } from '@/lib/transcription/types';
import type { AIProvider } from '@/lib/ai/types';
import { createSavedItem, SavedItemWithRelations } from './saved-items';
import { processSavedItem, SavedItemNotFoundError } from './processing';

export { SavedItemNotFoundError };

export class MissingAudioAttachmentError extends Error {
  constructor(savedItemId: string) {
    super(`Saved item ${savedItemId} has no audio attachment to transcribe`);
    this.name = 'MissingAudioAttachmentError';
  }
}

export class InvalidAudioFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAudioFileError';
  }
}

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // matches Whisper's real upload limit

const EXTENSION_MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.mpga': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

/**
 * AudioAttachment doesn't persist the original upload's mime type (kept to the
 * spec's minimal field list), so this best-effort guess from the storage
 * key's extension stands in for it at transcription time. Good enough since
 * Whisper primarily uses the filename extension for format detection anyway.
 */
export function guessMimeTypeFromKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MIME_TYPES[ext] ?? 'application/octet-stream';
}

export interface UploadAudioInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  title: string;
  tags?: string[];
  projects?: string[];
}

function assertValidAudioFile(input: Pick<UploadAudioInput, 'mimeType' | 'buffer'>): void {
  if (!input.mimeType.startsWith('audio/')) {
    throw new InvalidAudioFileError(`Unsupported file type: ${input.mimeType}`);
  }
  if (input.buffer.length === 0) {
    throw new InvalidAudioFileError('Audio file is empty');
  }
  if (input.buffer.length > MAX_AUDIO_BYTES) {
    throw new InvalidAudioFileError(`Audio file exceeds the ${MAX_AUDIO_BYTES} byte limit`);
  }
}

export interface UploadAudioResult {
  item: SavedItemWithRelations;
  audioAttachment: AudioAttachment;
}

/** Stores an audio file and creates the VOICE SavedItem + AudioAttachment pair for it. */
export async function uploadAudio(
  userId: string,
  input: UploadAudioInput,
  storage: StorageProvider = getStorageProvider(),
): Promise<UploadAudioResult> {
  assertValidAudioFile(input);

  const item = await createSavedItem(userId, {
    type: 'VOICE',
    title: input.title,
    tags: input.tags,
    projects: input.projects,
  });

  const { key } = await storage.upload({
    buffer: input.buffer,
    filename: input.filename,
    mimeType: input.mimeType,
  });

  const audioAttachment = await db.audioAttachment.create({
    data: { savedItemId: item.id, fileUrl: key, transcriptionStatus: 'PENDING' },
  });

  return { item, audioAttachment };
}

export type TranscriptionOutcome =
  | { success: true; data: TranscriptionResult }
  | { success: false; error: string };

/**
 * Runs the transcription provider and normalizes every failure mode into a
 * discriminated result instead of throwing. Depends only on its arguments, not
 * the database, so it's directly unit-testable with a fake provider — mirrors
 * runExtractionSafely in processing.ts.
 */
export async function runTranscriptionSafely(
  provider: TranscriptionProvider,
  input: TranscriptionInput,
): Promise<TranscriptionOutcome> {
  try {
    const data = await provider.transcribe(input);
    return { success: true, data };
  } catch (err) {
    if (err instanceof TranscriptionProviderError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown transcription error' };
  }
}

/**
 * Transcribes a VOICE saved item's audio, writes the transcript into
 * SavedItem.content, and triggers the existing Phase 2 processing pipeline on
 * success — reusing runExtractionSafely/persistExtractionResult unchanged.
 */
export async function transcribeSavedItemAudio(
  userId: string,
  savedItemId: string,
  transcriptionProvider: TranscriptionProvider = getTranscriptionProvider(),
  storage: StorageProvider = getStorageProvider(),
  aiProvider?: AIProvider,
): Promise<AudioAttachment> {
  const item = await db.savedItem.findFirst({
    where: { id: savedItemId, userId },
    include: { audioAttachment: true },
  });
  if (!item) throw new SavedItemNotFoundError(savedItemId);
  if (!item.audioAttachment) throw new MissingAudioAttachmentError(savedItemId);

  await db.audioAttachment.update({
    where: { savedItemId },
    data: { transcriptionStatus: 'PROCESSING' },
  });

  const buffer = await storage.read(item.audioAttachment.fileUrl);
  const outcome = await runTranscriptionSafely(transcriptionProvider, {
    buffer,
    filename: item.audioAttachment.fileUrl,
    mimeType: guessMimeTypeFromKey(item.audioAttachment.fileUrl),
  });

  if (!outcome.success) {
    return db.audioAttachment.update({
      where: { savedItemId },
      data: { transcriptionStatus: 'FAILED' },
    });
  }

  const audioAttachment = await db.audioAttachment.update({
    where: { savedItemId },
    data: {
      transcript: outcome.data.text,
      duration: outcome.data.durationSeconds ? Math.round(outcome.data.durationSeconds) : null,
      transcriptionStatus: 'COMPLETED',
    },
  });

  await db.savedItem.update({ where: { id: savedItemId }, data: { content: outcome.data.text } });
  await (aiProvider ? processSavedItem(userId, savedItemId, aiProvider) : processSavedItem(userId, savedItemId));

  return audioAttachment;
}

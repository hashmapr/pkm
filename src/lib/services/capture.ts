import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getCaptureRegistry } from '@/lib/capture';
import { CaptureProviderError } from '@/lib/capture/errors';
import type { CaptureInput, CaptureProviderRegistry } from '@/lib/capture';
import { getStorageProvider } from '@/lib/storage';
import type { StorageProvider } from '@/lib/storage/types';
import { createSavedItem } from './saved-items';

export interface CaptureItemInput extends CaptureInput {
  tags?: string[];
  projects?: string[];
}

/** Matches Whisper's real upload limit (Phase 3) — a reasonable generic cap for any capture file, not just audio. */
export const MAX_CAPTURE_FILE_BYTES = 25 * 1024 * 1024;

/**
 * The one entry point for universal capture: normalize whatever was handed
 * in (a URL, pasted text, or a file) via whichever CaptureProvider
 * supports() it, then create the resulting SavedItem exactly the way
 * manual creation already does — same tags/projects handling, same
 * automatic ProcessingJob queuing.
 *
 * File-based captures (image/screenshot/PDF) also get their raw bytes
 * persisted as an Attachment, storage upload handled here rather than in
 * each CaptureProvider — providers stay pure content-extraction, consistent
 * with Web/YouTube/GitHub never touching storage/DB either.
 */
export async function captureItem(
  userId: string,
  input: CaptureItemInput,
  registry: CaptureProviderRegistry = getCaptureRegistry(),
  storage: StorageProvider = getStorageProvider(),
) {
  if (input.file) {
    if (input.file.buffer.length === 0) {
      throw new CaptureProviderError(`File "${input.file.filename}" is empty`);
    }
    if (input.file.buffer.length > MAX_CAPTURE_FILE_BYTES) {
      throw new CaptureProviderError(`File "${input.file.filename}" exceeds the ${MAX_CAPTURE_FILE_BYTES} byte limit`);
    }
  }

  const result = await registry.capture(input);

  const item = await createSavedItem(userId, {
    type: result.type,
    title: result.title,
    source: result.source,
    content: result.content,
    metadata: result.metadata as Prisma.InputJsonValue | undefined,
    tags: input.tags,
    projects: input.projects,
  });

  if (!input.file) return item;

  const { key } = await storage.upload({
    buffer: input.file.buffer,
    filename: input.file.filename,
    mimeType: input.file.mimeType,
  });
  const attachment = await db.attachment.create({
    data: {
      savedItemId: item.id,
      storagePath: key,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.buffer.length,
    },
  });

  return { ...item, attachments: [...item.attachments, attachment] };
}

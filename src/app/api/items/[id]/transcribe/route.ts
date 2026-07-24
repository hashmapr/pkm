import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { getSavedItem } from '@/lib/services/saved-items';
import {
  MissingAudioAttachmentError,
  SavedItemNotFoundError,
  transcribeSavedItemAudio,
} from '@/lib/services/audio';

interface Params {
  params: { id: string };
}

/**
 * Transcribes a VOICE saved item's audio and, on success, automatically
 * triggers the existing Phase 2 processing pipeline (unlike plain
 * create/update, which only queue a job) — see ARCHITECTURE.md.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const audioAttachment = await transcribeSavedItemAudio(userId, params.id);
    const item = await getSavedItem(userId, params.id);
    return NextResponse.json({ audioAttachment, item });
  } catch (err) {
    if (err instanceof SavedItemNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (err instanceof MissingAudioAttachmentError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

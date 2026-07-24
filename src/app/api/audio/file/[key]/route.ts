import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';
import { StorageError } from '@/lib/storage/errors';
import { guessMimeTypeFromKey } from '@/lib/services/audio';

interface Params {
  params: { key: string };
}

/** Serves a stored audio file — authenticated and scoped to the requesting user's own attachment. */
export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const audioAttachment = await db.audioAttachment.findFirst({
    where: { fileUrl: params.key, savedItem: { userId } },
  });
  if (!audioAttachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const buffer = await getStorageProvider().read(params.key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': guessMimeTypeFromKey(params.key) },
    });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}

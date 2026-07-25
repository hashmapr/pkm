import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';
import { StorageError } from '@/lib/storage/errors';

interface Params {
  params: { key: string };
}

/**
 * Serves a stored capture attachment (image/screenshot/PDF) — authenticated
 * and scoped to the requesting user's own attachment. Unlike
 * /api/audio/file/[key], Attachment.mimeType is a real stored column, not a
 * guess from the key's extension.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const attachment = await db.attachment.findFirst({
    where: { storagePath: params.key, savedItem: { userId } },
  });
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const buffer = await getStorageProvider().read(params.key);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': attachment.mimeType },
    });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}

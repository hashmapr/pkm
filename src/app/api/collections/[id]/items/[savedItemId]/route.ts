import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { CollectionNotFoundError, removeItemFromCollection } from '@/lib/services/collections';

interface Params {
  params: { id: string; savedItemId: string };
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await removeItemFromCollection(userId, params.id, params.savedItemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CollectionNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}

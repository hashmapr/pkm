import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { addItemToCollectionSchema } from '@/lib/validation/collections';
import { addItemToCollection, CollectionNotFoundError } from '@/lib/services/collections';

interface Params {
  params: { id: string };
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = addItemToCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await addItemToCollection(userId, params.id, parsed.data.savedItemId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof CollectionNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Saved item not found' }, { status: 404 });
  }
}

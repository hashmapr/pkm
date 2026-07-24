import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { getSavedItem } from '@/lib/services/saved-items';
import { findRelatedItems } from '@/lib/services/search';

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const item = await getSavedItem(userId, params.id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const relatedItems = await findRelatedItems(userId, params.id);
  return NextResponse.json({ relatedItems });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { getSavedItem } from '@/lib/services/saved-items';
import { processSavedItem, SavedItemNotFoundError } from '@/lib/services/processing';

interface Params {
  params: { id: string };
}

/**
 * Runs the AI processing pipeline synchronously and returns the finished job
 * plus the updated item. There's no queue yet — see ARCHITECTURE.md for the
 * migration path to a background worker that will make this endpoint return
 * immediately with a PENDING job instead.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const job = await processSavedItem(userId, params.id);
    const item = await getSavedItem(userId, params.id);
    return NextResponse.json({ job, item });
  } catch (err) {
    if (err instanceof SavedItemNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { acceptSuggestedCollectionSchema } from '@/lib/validation/collections';
import { acceptSuggestedCollection } from '@/lib/services/collection-suggestions';

/**
 * Materializes an AI-suggested collection the user confirmed — never fires
 * automatically from GET .../suggested, same "AI suggests, user confirms"
 * rule as Phase 5's knowledge actions.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = acceptSuggestedCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const collection = await acceptSuggestedCollection(userId, parsed.data);
    return NextResponse.json({ collection }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'A collection with this name already exists' }, { status: 409 });
  }
}

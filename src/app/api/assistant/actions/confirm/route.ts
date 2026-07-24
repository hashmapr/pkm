import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { confirmActionSchema } from '@/lib/validation/assistant';
import { confirmSuggestedAction, SavedItemNotFoundForActionError } from '@/lib/services/knowledge-actions';

/**
 * The only endpoint that turns a suggested action into a real database
 * write. Only reachable via an explicit user confirmation click — the chat
 * response path itself never calls this.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = confirmActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await confirmSuggestedAction(userId, parsed.data);
    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    if (err instanceof SavedItemNotFoundForActionError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}

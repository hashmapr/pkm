import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { suggestCollections } from '@/lib/services/collection-suggestions';

/** Candidate AI-suggested collections — nothing is created until POST .../accept confirms one. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const suggestions = await suggestCollections(userId);
  return NextResponse.json({ suggestions });
}

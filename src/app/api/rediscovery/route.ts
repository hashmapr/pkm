import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { getRediscoveryDigest } from '@/lib/services/rediscovery';

/**
 * The weekly-digest-shaped query, exposed on demand — there's no job
 * scheduler in this app yet, so this endpoint stands in for what a
 * scheduled digest would compute rather than pretending one exists.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const digest = await getRediscoveryDigest(userId);
  return NextResponse.json(digest);
}

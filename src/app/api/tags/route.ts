import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { listTags } from '@/lib/services/tags';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tags = await listTags(userId);
  return NextResponse.json({ tags });
}

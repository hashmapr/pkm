import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { listConversations } from '@/lib/services/conversations';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversations = await listConversations(userId);
  return NextResponse.json({ conversations });
}

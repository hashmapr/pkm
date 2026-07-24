import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { searchQuerySchema } from '@/lib/validation/search';
import { searchKnowledgeBase } from '@/lib/services/search';
import { EmbeddingProviderError } from '@/lib/embeddings/errors';

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = searchQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await searchKnowledgeBase(userId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EmbeddingProviderError) {
      return NextResponse.json({ error: 'Search is temporarily unavailable' }, { status: 502 });
    }
    throw err;
  }
}

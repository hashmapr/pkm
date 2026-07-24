import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { chatMessageSchema } from '@/lib/validation/assistant';
import { askAssistant, ConversationNotFoundError } from '@/lib/services/assistant-chat';
import { EmbeddingProviderError } from '@/lib/embeddings/errors';

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { conversation, userMessage, assistantMessage } = await askAssistant(
      userId,
      parsed.data.question,
      parsed.data.conversationId,
      parsed.data.mode,
    );
    return NextResponse.json({ conversation, userMessage, assistantMessage }, { status: 201 });
  } catch (err) {
    if (err instanceof ConversationNotFoundError) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (err instanceof EmbeddingProviderError) {
      return NextResponse.json({ error: 'The assistant is temporarily unavailable' }, { status: 502 });
    }
    throw err;
  }
}

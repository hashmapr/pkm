import { db } from '@/lib/db';

export async function listConversations(userId: string) {
  return db.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getConversationWithMessages(userId: string, conversationId: string) {
  return db.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
}

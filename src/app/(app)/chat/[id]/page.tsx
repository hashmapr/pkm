import { notFound, redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { getConversationWithMessages } from '@/lib/services/conversations';
import { ChatView } from '@/components/chat/chat-view';
import type { ConversationWithMessagesDto } from '@/types/assistant';

interface ChatConversationPageProps {
  params: { id: string };
}

export default async function ChatConversationPage({ params }: ChatConversationPageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const conversation = await getConversationWithMessages(userId, params.id);
  if (!conversation) notFound();

  const dto = JSON.parse(JSON.stringify(conversation)) as ConversationWithMessagesDto;

  return (
    <div>
      <h1 className="text-xl font-semibold">{dto.title ?? 'Conversation'}</h1>
      <div className="mt-4">
        <ChatView initialConversationId={dto.id} initialMessages={dto.messages} />
      </div>
    </div>
  );
}

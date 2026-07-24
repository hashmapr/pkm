import { ChatView } from '@/components/chat/chat-view';

export default function NewChatPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Assistant</h1>
      <div className="mt-4">
        <ChatView />
      </div>
    </div>
  );
}

import { ConversationSidebar } from '@/components/chat/conversation-sidebar';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <ConversationSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

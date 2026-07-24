'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ConversationDto } from '@/types/assistant';

export function ConversationSidebar() {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const [conversations, setConversations] = useState<ConversationDto[]>([]);

  useEffect(() => {
    function refresh() {
      fetch('/api/assistant/conversations')
        .then((res) => res.json())
        .then((data) => setConversations(data.conversations ?? []))
        .catch(() => setConversations([]));
    }

    refresh();
    window.addEventListener('conversations:refresh', refresh);
    return () => window.removeEventListener('conversations:refresh', refresh);
  }, []);

  return (
    <div className="w-56 shrink-0 border-r border-gray-200 pr-4 dark:border-neutral-800">
      <Link
        href="/chat"
        className="block rounded-md bg-neutral-900 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
      >
        + New chat
      </Link>
      <div className="mt-4 space-y-1">
        {conversations.map((c) => (
          <Link
            key={c.id}
            href={`/chat/${c.id}`}
            className={`block truncate rounded-md px-2 py-1.5 text-sm ${
              activeId === c.id
                ? 'bg-gray-100 font-medium dark:bg-neutral-800'
                : 'text-gray-600 hover:bg-gray-50 dark:text-neutral-400 dark:hover:bg-neutral-900'
            }`}
          >
            {c.title ?? 'New conversation'}
          </Link>
        ))}
        {conversations.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-gray-400">No conversations yet</p>
        )}
      </div>
    </div>
  );
}

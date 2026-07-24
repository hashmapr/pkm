'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AssistantMode, MessageDto } from '@/types/assistant';
import { ASSISTANT_MODE_LABELS } from '@/types/assistant';
import { MessageBubble } from './message-bubble';

const MODES: AssistantMode[] = ['ANSWER', 'SUMMARIZE', 'COMPARE', 'FIND_CONFLICTS'];

interface ChatViewProps {
  initialConversationId?: string;
  initialMessages?: MessageDto[];
}

export function ChatView({ initialConversationId, initialMessages = [] }: ChatViewProps) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<MessageDto[]>(initialMessages);
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<AssistantMode>('ANSWER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    const res = await fetch('/api/assistant/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, question: trimmed, mode }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Something went wrong asking that');
      return;
    }

    const data = await res.json();
    setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
    setQuestion('');

    if (!conversationId) {
      setConversationId(data.conversation.id);
      router.replace(`/chat/${data.conversation.id}`);
    }
    window.dispatchEvent(new Event('conversations:refresh'));
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mt-12 text-center text-sm text-gray-500 dark:text-neutral-400">
            <p>Ask about anything you've saved.</p>
            <p className="mt-1 text-xs text-gray-400">
              "What did I decide about databases?" · "Summarize everything I know about AI agents." ·
              "What tasks are still unresolved?"
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {loading && <p className="text-sm text-gray-400">Thinking…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 pt-3 dark:border-neutral-800">
        <div className="mb-2 flex gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                mode === m
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
              }`}
            >
              {ASSISTANT_MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your saved knowledge…"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

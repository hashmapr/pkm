'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ContextSourceDto, MessageDto, SuggestedActionDto } from '@/types/assistant';
import { ENTITY_TYPE_LABELS } from '@/types/assistant';

function SourceCard({ source }: { source: ContextSourceDto }) {
  return (
    <Link
      href={`/items/${source.savedItemId}`}
      className="block rounded-md border border-gray-200 px-3 py-2 text-xs hover:border-gray-300 dark:border-neutral-800 dark:hover:border-neutral-700"
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
          {ENTITY_TYPE_LABELS[source.entityType]}
        </span>
        <span className="text-gray-400">{Math.round(source.similarity * 100)}%</span>
      </div>
      <p className="mt-1 font-medium">{source.savedItemTitle}</p>
      <p className="mt-0.5 line-clamp-2 text-gray-500 dark:text-neutral-400">{source.label}</p>
    </Link>
  );
}

function SuggestedActionButton({ action }: { action: SuggestedActionDto }) {
  const [state, setState] = useState<'idle' | 'confirming' | 'done' | 'error'>('idle');

  async function handleConfirm() {
    setState('confirming');
    const res = await fetch('/api/assistant/actions/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: action.type, payload: action.payload }),
    });
    setState(res.ok ? 'done' : 'error');
  }

  if (state === 'done') {
    return <p className="text-xs text-green-700 dark:text-green-400">✓ {action.label} — done</p>;
  }

  return (
    <button
      onClick={handleConfirm}
      disabled={state === 'confirming'}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      {state === 'confirming' ? 'Working…' : state === 'error' ? 'Failed — retry?' : `Confirm: ${action.label}`}
    </button>
  );
}

export function MessageBubble({ message }: { message: MessageDto }) {
  const isUser = message.role === 'USER';
  const info = message.sourcesUsed;

  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`max-w-2xl rounded-lg px-4 py-3 ${
        isUser
          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
          : 'border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
      }`}
      >
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>

        {!isUser && info && (
          <>
            {info.confidence > 0 && (
              <p className="mt-2 text-xs text-gray-400">Confidence: {Math.round(info.confidence * 100)}%</p>
            )}

            {info.sources.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-medium text-gray-500 dark:text-neutral-400">Sources</h4>
                <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {info.sources.map((s) => (
                    <SourceCard key={`${s.entityType}-${s.entityId}`} source={s} />
                  ))}
                </div>
              </div>
            )}

            {info.relatedItems.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-medium text-gray-500 dark:text-neutral-400">Related items</h4>
                <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {info.relatedItems.map((s) => (
                    <SourceCard key={`${s.entityType}-${s.entityId}`} source={s} />
                  ))}
                </div>
              </div>
            )}

            {info.suggestedActions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {info.suggestedActions.map((action, i) => (
                  <SuggestedActionButton key={i} action={action} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

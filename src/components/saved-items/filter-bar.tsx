'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SAVED_ITEM_TYPE_LABELS, SAVED_ITEM_TYPES } from '@/types/saved-item';

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/inbox?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        defaultValue={searchParams.get('q') ?? ''}
        onKeyDown={(e) => {
          if (e.key === 'Enter') updateParam('q', e.currentTarget.value);
        }}
        placeholder="Search title, content, summary…"
        className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
      <select
        defaultValue={searchParams.get('type') ?? ''}
        onChange={(e) => updateParam('type', e.target.value)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      >
        <option value="">All types</option>
        {SAVED_ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {SAVED_ITEM_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

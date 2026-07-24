'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { SAVED_ITEM_TYPE_LABELS, SAVED_ITEM_TYPES } from '@/types/saved-item';
import { RELATED_OBJECT_TYPE_LABELS, SearchResponseDto } from '@/types/search';

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const type = searchParams.get('type') ?? '';
  const project = searchParams.get('project') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const [result, setResult] = useState<SearchResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResult(null);
      return;
    }

    const params = new URLSearchParams();
    params.set('q', q);
    if (type) params.set('type', type);
    if (project) params.set('project', project);
    if (tag) params.set('tag', tag);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    setLoading(true);
    setError(null);

    fetch(`/api/search?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Search failed');
        return res.json() as Promise<SearchResponseDto>;
      })
      .then(setResult)
      .catch(() => setError('Something went wrong running that search'))
      .finally(() => setLoading(false));
  }, [q, type, project, tag, from, to]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/search?${params.toString()}`);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Search</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
        Search by meaning — "AI agents", "college project ideas", "database decisions".
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={type}
          onChange={(e) => updateFilter('type', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="">All types</option>
          {SAVED_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {SAVED_ITEM_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          defaultValue={project}
          onKeyDown={(e) => e.key === 'Enter' && updateFilter('project', e.currentTarget.value)}
          placeholder="Project"
          className="w-36 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <input
          defaultValue={tag}
          onKeyDown={(e) => e.key === 'Enter' && updateFilter('tag', e.currentTarget.value)}
          placeholder="Tag"
          className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-neutral-400">
          From
          <input
            type="date"
            defaultValue={from}
            onChange={(e) => updateFilter('from', e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-neutral-400">
          To
          <input
            type="date"
            defaultValue={to}
            onChange={(e) => updateFilter('to', e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
      </div>

      {!q.trim() && (
        <p className="mt-12 text-center text-sm text-gray-500 dark:text-neutral-400">
          Type a search above to get started.
        </p>
      )}

      {loading && <p className="mt-8 text-sm text-gray-500 dark:text-neutral-400">Searching…</p>}
      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}

      {result && !loading && (
        <>
          <p className="mt-6 text-sm text-gray-500 dark:text-neutral-400">
            {result.items.length} result{result.items.length === 1 ? '' : 's'} for "{q}"
          </p>

          {result.items.length === 0 && (
            <p className="mt-8 text-sm text-gray-500 dark:text-neutral-400">
              No matches. Try a different phrase, or check that the item has finished AI processing.
            </p>
          )}

          <div className="mt-3 space-y-3">
            {result.items.map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {SAVED_ITEM_TYPE_LABELS[item.type]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {Math.round(item.similarity * 100)}% match
                    </span>
                  </div>
                  <time className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</time>
                </div>
                <h3 className="mt-2 font-medium">{item.title}</h3>
                {item.highlight && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">{item.highlight}</p>
                )}
              </Link>
            ))}
          </div>

          {result.relatedObjects.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Related objects</h2>
              <div className="mt-2 space-y-2">
                {result.relatedObjects.map((obj) => (
                  <Link
                    key={`${obj.entityType}-${obj.entityId}`}
                    href={`/items/${obj.savedItemId}`}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:border-gray-300 dark:border-neutral-800 dark:hover:border-neutral-700"
                  >
                    <span>
                      <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {RELATED_OBJECT_TYPE_LABELS[obj.entityType]}
                      </span>
                      {obj.label}
                      <span className="ml-1 text-gray-400">— {obj.savedItemTitle}</span>
                    </span>
                    <span className="text-xs text-gray-400">{Math.round(obj.similarity * 100)}%</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

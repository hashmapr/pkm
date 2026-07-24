import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { listSavedItems } from '@/lib/services/saved-items';
import { listSavedItemsQuerySchema } from '@/lib/validation/saved-item';
import { SavedItemCard } from '@/components/saved-items/item-card';
import { FilterBar } from '@/components/saved-items/filter-bar';
import type { SavedItemDto } from '@/types/saved-item';

interface InboxPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const parsed = listSavedItemsQuerySchema.safeParse(searchParams);
  const filters = parsed.success
    ? parsed.data
    : { page: 1, pageSize: 25 as const };

  const { items, total } = await listSavedItems(userId, filters);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <Link
          href="/items/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
        >
          + New item
        </Link>
      </div>

      <div className="mt-4">
        <Suspense>
          <FilterBar />
        </Suspense>
      </div>

      <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">{total} saved items</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(items as unknown as SavedItemDto[]).map((item) => (
          <SavedItemCard key={item.id} item={item} />
        ))}
      </div>

      {items.length === 0 && (
        <div className="mt-12 text-center text-sm text-gray-500 dark:text-neutral-400">
          Nothing here yet. Save your first item to get started.
        </div>
      )}
    </div>
  );
}

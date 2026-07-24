import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { getCollectionWithItems } from '@/lib/services/collections';
import { SAVED_ITEM_TYPE_LABELS } from '@/types/saved-item';
import { DeleteCollectionButton } from '@/components/collections/delete-collection-button';
import { RemoveFromCollectionButton } from '@/components/collections/remove-from-collection-button';

interface CollectionDetailPageProps {
  params: { id: string };
}

export default async function CollectionDetailPage({ params }: CollectionDetailPageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const collection = await getCollectionWithItems(userId, params.id);
  if (!collection) notFound();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {collection.emoji ? `${collection.emoji} ` : ''}
          {collection.name}
        </h1>
        <DeleteCollectionButton id={collection.id} />
      </div>
      {collection.description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{collection.description}</p>
      )}

      <div className="mt-6 space-y-2">
        {collection.items.map(({ savedItem }) => (
          <div
            key={savedItem.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Link href={`/items/${savedItem.id}`} className="flex-1 truncate text-sm hover:underline">
              <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                {SAVED_ITEM_TYPE_LABELS[savedItem.type]}
              </span>
              {savedItem.title}
            </Link>
            <RemoveFromCollectionButton collectionId={collection.id} savedItemId={savedItem.id} />
          </div>
        ))}
      </div>

      {collection.items.length === 0 && (
        <p className="mt-8 text-sm text-gray-500 dark:text-neutral-400">
          Nothing in this collection yet — add items from their detail page.
        </p>
      )}
    </div>
  );
}

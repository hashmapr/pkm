import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { getSavedItem, markSavedItemViewed } from '@/lib/services/saved-items';
import { findRelatedItems } from '@/lib/services/search';
import { SAVED_ITEM_TYPE_LABELS } from '@/types/saved-item';
import { DeleteItemButton } from '@/components/saved-items/delete-item-button';
import { AddToCollection } from '@/components/collections/add-to-collection';

interface ItemDetailPageProps {
  params: { id: string };
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const item = await getSavedItem(userId, params.id);
  if (!item) notFound();

  await markSavedItemViewed(userId, params.id);

  const relatedItems = await findRelatedItems(userId, params.id);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
            {SAVED_ITEM_TYPE_LABELS[item.type]}
          </span>
          {item.importanceScore !== null && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Importance: {Math.round(item.importanceScore * 100)}%
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/items/${item.id}/edit`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700"
          >
            Edit
          </Link>
          <DeleteItemButton id={item.id} />
        </div>
      </div>

      <h1 className="mt-3 text-2xl font-semibold">{item.title}</h1>

      {item.source && (
        <a
          href={item.source}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {item.source}
        </a>
      )}

      <p className="mt-2 text-xs text-gray-400">
        Saved {new Date(item.createdAt).toLocaleString()}
      </p>

      {item.saveReason && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span className="font-medium">Why this was saved:</span> {item.saveReason}
        </div>
      )}

      {item.summary && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Summary</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{item.summary}</p>
        </div>
      )}

      {item.content && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Content</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{item.content}</p>
        </div>
      )}

      {(item.tags.length > 0 || item.projects.length > 0 || item.collections.length > 0) && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {item.projects.map(({ project }) => (
            <span
              key={project.id}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {project.name}
            </span>
          ))}
          {item.collections.map(({ collection }) => (
            <span
              key={collection.id}
              className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-950 dark:text-purple-300"
            >
              {collection.emoji ? `${collection.emoji} ` : ''}
              {collection.name}
            </span>
          ))}
          {item.tags.map(({ tag }) => (
            <span
              key={tag.id}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      <AddToCollection savedItemId={item.id} currentCollectionIds={item.collections.map((c) => c.collection.id)} />

      {relatedItems.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Related items</h2>
          <div className="mt-2 space-y-2">
            {relatedItems.map((related) => (
              <Link
                key={related.id}
                href={`/items/${related.id}`}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:border-gray-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              >
                <span>
                  <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {SAVED_ITEM_TYPE_LABELS[related.type]}
                  </span>
                  {related.title}
                </span>
                <span className="text-xs text-gray-400">{Math.round(related.similarity * 100)}% similar</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

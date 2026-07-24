import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { listCollections } from '@/lib/services/collections';
import { NewCollectionForm } from '@/components/collections/new-collection-form';

export default async function CollectionsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const collections = await listCollections(userId);

  return (
    <div>
      <h1 className="text-xl font-semibold">Collections</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
        A lighter, more casual way to group saved items than projects — "AI," "Startup Ideas," "College."
      </p>

      <div className="mt-6">
        <NewCollectionForm />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={`/collections/${collection.id}`}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
          >
            <h3 className="font-medium">
              {collection.emoji ? `${collection.emoji} ` : ''}
              {collection.name}
            </h3>
            {collection.description && (
              <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">{collection.description}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <p className="text-xs text-gray-400">{collection._count.items} items</p>
              {collection.isAiSuggested && (
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                  AI suggested
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {collections.length === 0 && (
        <p className="mt-8 text-sm text-gray-500 dark:text-neutral-400">
          No collections yet — add one above, or add items to a collection from their detail page.
        </p>
      )}
    </div>
  );
}

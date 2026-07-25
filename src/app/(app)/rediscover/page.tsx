import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { getRediscoveryDigest } from '@/lib/services/rediscovery';
import { suggestCollections } from '@/lib/services/collection-suggestions';
import { SAVED_ITEM_TYPE_LABELS } from '@/types/saved-item';
import { AcceptSuggestedCollectionButton } from '@/components/rediscovery/accept-suggested-collection-button';

function TypeBadge({ type }: { type: keyof typeof SAVED_ITEM_TYPE_LABELS }) {
  return (
    <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
      {SAVED_ITEM_TYPE_LABELS[type]}
    </span>
  );
}

export default async function RediscoverPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const [digest, suggestions] = await Promise.all([getRediscoveryDigest(userId), suggestCollections(userId)]);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Rediscover</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          What you just saved, what you've forgotten, and how they connect — computed on demand
          (there's no scheduled digest yet, just this page).
        </p>
      </div>

      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Suggested collections</h2>
        {suggestions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No clusters of similar recent saves yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.itemIds.join(',')}
                className="rounded-md border border-gray-200 px-3 py-2 dark:border-neutral-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{suggestion.name}</span>
                  <AcceptSuggestedCollectionButton name={suggestion.name} itemIds={suggestion.itemIds} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-neutral-400">
                  {suggestion.items.map((item) => (
                    <span key={item.id}>{item.title}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Related discoveries</h2>
        {digest.relatedDiscoveries.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Nothing recent connects to older saves yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {digest.relatedDiscoveries.map((discovery) => (
              <div
                key={`${discovery.anchor.id}-${discovery.relatedItem.id}`}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <Link href={`/items/${discovery.anchor.id}`} className="hover:underline">
                  <TypeBadge type={discovery.anchor.type} />
                  {discovery.anchor.title}
                </Link>
                <div className="mt-1 pl-2 text-gray-500 dark:text-neutral-400">
                  connects to something you saved on {new Date(discovery.relatedItem.createdAt).toLocaleDateString()} —{' '}
                  <Link href={`/items/${discovery.relatedItem.id}`} className="hover:underline">
                    <TypeBadge type={discovery.relatedItem.type} />
                    {discovery.relatedItem.title}
                  </Link>
                  <span className="ml-2 text-xs text-gray-400">{Math.round(discovery.relatedItem.similarity * 100)}% similar</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Forgotten items</h2>
        {digest.forgottenItems.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Nothing's been forgotten yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {digest.forgottenItems.map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:border-gray-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              >
                <span>
                  <TypeBadge type={item.type} />
                  {item.title}
                </span>
                <span className="text-xs text-gray-400">
                  {item.lastViewedAt ? `last viewed ${new Date(item.lastViewedAt).toLocaleDateString()}` : 'never opened'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-neutral-400">Recently saved</h2>
        {digest.recentlySaved.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Nothing saved yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {digest.recentlySaved.map((item) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:border-gray-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              >
                <span>
                  <TypeBadge type={item.type} />
                  {item.title}
                </span>
                <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

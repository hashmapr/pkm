import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { getSavedItem } from '@/lib/services/saved-items';
import { SAVED_ITEM_TYPE_LABELS } from '@/types/saved-item';
import { DeleteItemButton } from '@/components/saved-items/delete-item-button';

interface ItemDetailPageProps {
  params: { id: string };
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const item = await getSavedItem(userId, params.id);
  if (!item) notFound();

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
          {SAVED_ITEM_TYPE_LABELS[item.type]}
        </span>
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

      {(item.tags.length > 0 || item.projects.length > 0) && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {item.projects.map(({ project }) => (
            <span
              key={project.id}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {project.name}
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
    </div>
  );
}

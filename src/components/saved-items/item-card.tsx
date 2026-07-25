import Link from 'next/link';
import { SAVED_ITEM_TYPE_LABELS, SavedItemDto } from '@/types/saved-item';

export function SavedItemCard({ item }: { item: SavedItemDto }) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
            {SAVED_ITEM_TYPE_LABELS[item.type]}
          </span>
          {item.importanceScore !== null && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {Math.round(item.importanceScore * 100)}%
            </span>
          )}
        </div>
        <time className="text-xs text-gray-400" dateTime={item.createdAt}>
          {new Date(item.createdAt).toLocaleDateString()}
        </time>
      </div>
      <h3 className="mt-2 font-medium">{item.title}</h3>
      {item.summary ? (
        <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-neutral-400">{item.summary}</p>
      ) : item.content ? (
        <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-neutral-400">{item.content}</p>
      ) : null}
      {item.saveReason && (
        <p className="mt-1 line-clamp-1 text-xs italic text-amber-700 dark:text-amber-400">{item.saveReason}</p>
      )}
      {(item.tags.length > 0 || item.projects.length > 0 || item.collections.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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
    </Link>
  );
}

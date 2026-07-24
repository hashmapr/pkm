'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SAVED_ITEM_TYPE_LABELS, SAVED_ITEM_TYPES, SavedItemDto, SavedItemType } from '@/types/saved-item';

interface ItemFormProps {
  item?: SavedItemDto;
}

export function SavedItemForm({ item }: ItemFormProps) {
  const router = useRouter();
  const isEditing = Boolean(item);

  const [type, setType] = useState<SavedItemType>(item?.type ?? 'NOTE');
  const [title, setTitle] = useState(item?.title ?? '');
  const [source, setSource] = useState(item?.source ?? '');
  const [content, setContent] = useState(item?.content ?? '');
  const [tags, setTags] = useState(item?.tags.map((t) => t.tag.name).join(', ') ?? '');
  const [projects, setProjects] = useState(item?.projects.map((p) => p.project.name).join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      type,
      title,
      source: source || undefined,
      content: content || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      projects: projects
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    };

    const res = await fetch(isEditing ? `/api/items/${item!.id}` : '/api/items', {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not save item');
      return;
    }

    const data = await res.json();
    router.push(`/items/${data.item.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as SavedItemType)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          {SAVED_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {SAVED_ITEM_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Title</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Source (URL, optional)</label>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://..."
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Content / notes</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Tags (comma separated)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ai, agents"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Projects (comma separated)</label>
          <input
            value={projects}
            onChange={(e) => setProjects(e.target.value)}
            placeholder="OfficeFlow"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save item'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

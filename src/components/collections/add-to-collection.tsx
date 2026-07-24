'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CollectionOption {
  id: string;
  name: string;
  emoji: string | null;
}

export function AddToCollection({ savedItemId, currentCollectionIds }: { savedItemId: string; currentCollectionIds: string[] }) {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/collections')
      .then((res) => res.json())
      .then((data) => setCollections(data.collections ?? []))
      .catch(() => setCollections([]));
  }, []);

  const available = collections.filter((c) => !currentCollectionIds.includes(c.id));

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/collections/${selected}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedItemId }),
    });
    setSaving(false);
    if (res.ok) {
      setSelected('');
      router.refresh();
    }
  }

  if (available.length === 0) return null;

  return (
    <div className="mt-4 flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      >
        <option value="">Add to collection…</option>
        {available.map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji ? `${c.emoji} ` : ''}
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleAdd}
        disabled={!selected || saving}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
      >
        {saving ? 'Adding…' : 'Add'}
      </button>
    </div>
  );
}

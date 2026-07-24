'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteCollectionButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this collection? Saved items themselves are kept.')) return;
    setDeleting(true);
    const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) {
      router.push('/collections');
      router.refresh();
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
    >
      {deleting ? 'Deleting…' : 'Delete collection'}
    </button>
  );
}

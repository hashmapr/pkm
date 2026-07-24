'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RemoveFromCollectionButton({
  collectionId,
  savedItemId,
}: {
  collectionId: string;
  savedItemId: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    const res = await fetch(`/api/collections/${collectionId}/items/${savedItemId}`, { method: 'DELETE' });
    setRemoving(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      onClick={handleRemove}
      disabled={removing}
      className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-neutral-800"
      title="Remove from collection"
    >
      {removing ? '…' : '✕'}
    </button>
  );
}

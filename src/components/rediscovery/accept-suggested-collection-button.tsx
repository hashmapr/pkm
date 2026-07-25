'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface AcceptSuggestedCollectionButtonProps {
  name: string;
  itemIds: string[];
}

/** Materializes an AI-suggested collection — nothing is created until this is clicked. */
export function AcceptSuggestedCollectionButton({ name, itemIds }: AcceptSuggestedCollectionButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleAccept() {
    setSaving(true);
    const res = await fetch('/api/collections/suggested/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, itemIds }),
    });
    setSaving(false);
    if (res.ok) {
      setDone(true);
      router.refresh();
    }
  }

  if (done) {
    return <span className="text-sm text-gray-500 dark:text-neutral-400">Added to Collections</span>;
  }

  return (
    <button
      onClick={handleAccept}
      disabled={saving}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      {saving ? 'Adding…' : 'Accept as collection'}
    </button>
  );
}

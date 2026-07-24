'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Could not create project');
      return;
    }

    setName('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project name"
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {saving ? 'Adding…' : 'Add project'}
      </button>
      {error && <p className="self-center text-sm text-red-600">{error}</p>}
    </form>
  );
}

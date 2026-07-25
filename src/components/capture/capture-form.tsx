'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function errorMessage(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'formErrors' in err) {
      const formErrors = (err as { formErrors?: string[] }).formErrors;
      if (formErrors?.length) return formErrors[0];
    }
  }
  return 'Could not capture this — something went wrong.';
}

/**
 * The universal capture entry point: one box for a link or pasted/dictated
 * text (auto-detected client-side — a real URL goes as `url`, anything else
 * as `text`), or a file (image/screenshot/PDF) instead. Whichever provider
 * `supports()` the input on the server decides the rest; this form doesn't
 * know or care which CaptureProvider ends up handling it.
 */
export function CaptureForm() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [projects, setProjects] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isScreenshot, setIsScreenshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasFile = Boolean(file);
  const detectedUrl = !hasFile && looksLikeUrl(input);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasFile && !input.trim()) {
      setError('Paste a link or some text, or choose a file.');
      return;
    }

    setSaving(true);

    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const projectList = projects.split(',').map((p) => p.trim()).filter(Boolean);

    let res: Response;
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      if (title.trim()) formData.append('title', title.trim());
      if (isScreenshot) formData.append('hint', 'screenshot');
      // The route reads tags/projects as one comma-separated field each.
      if (tagList.length) formData.append('tags', tagList.join(','));
      if (projectList.length) formData.append('projects', projectList.join(','));

      res = await fetch('/api/capture', { method: 'POST', body: formData });
    } else {
      const payload: Record<string, unknown> = {
        title: title.trim() || undefined,
        tags: tagList,
        projects: projectList,
      };
      if (detectedUrl) payload.url = input.trim();
      else payload.text = input.trim();

      res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(errorMessage(data));
      return;
    }

    const data = await res.json();
    router.push(`/items/${data.item.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Paste a link, or write something</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={hasFile}
          rows={5}
          placeholder="https://... or just start typing"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
        />
        {detectedUrl && (
          <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
            Detected as a link — YouTube and GitHub URLs get special handling automatically.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-neutral-400">
        <span className="h-px flex-1 bg-gray-200 dark:bg-neutral-800" />
        or
        <span className="h-px flex-1 bg-gray-200 dark:bg-neutral-800" />
      </div>

      <div>
        <label className="block text-sm font-medium">Upload a file (image, screenshot, or PDF)</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 w-full text-sm"
        />
        {file && file.type.startsWith('image/') && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isScreenshot} onChange={(e) => setIsScreenshot(e.target.checked)} />
            This is a screenshot (not a photo)
          </label>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Leave blank to auto-generate"
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
          {saving ? 'Capturing…' : 'Capture'}
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

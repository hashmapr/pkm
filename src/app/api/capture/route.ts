import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { captureRequestSchema } from '@/lib/validation/capture';
import { captureItem } from '@/lib/services/capture';
import { CaptureProviderError, NoCaptureProviderError } from '@/lib/capture';

function parseCommaSeparated(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseHint(value: FormDataEntryValue | null): 'IMAGE' | 'SCREENSHOT' | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim().toUpperCase() === 'SCREENSHOT' ? 'SCREENSHOT' : undefined;
}

/**
 * The universal capture endpoint: one route, dispatched internally to
 * whichever CaptureProvider recognizes the input — plain text
 * (NoteCaptureProvider), YouTube/GitHub/generic-webpage URLs (Sub-Phase B),
 * and now image/screenshot/PDF file uploads (Sub-Phase C) via
 * multipart/form-data. JSON bodies (url/text) still go through the same
 * path as before; this route branches on content-type, but dispatch itself
 * never changes here, only the registry's contents do.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: 'Missing file (field "file")' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = file instanceof File ? file.name : 'upload';
      const mimeType = file.type || 'application/octet-stream';
      const title = formData.get('title');

      const item = await captureItem(userId, {
        file: { buffer, filename, mimeType },
        title: typeof title === 'string' ? title : undefined,
        hint: parseHint(formData.get('hint')),
        tags: parseCommaSeparated(formData.get('tags')),
        projects: parseCommaSeparated(formData.get('projects')),
      });
      return NextResponse.json({ item }, { status: 201 });
    }

    const body = await req.json().catch(() => null);
    const parsed = captureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const item = await captureItem(userId, parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof NoCaptureProviderError) {
      return NextResponse.json(
        { error: 'Nothing can capture this input yet' },
        { status: 422 },
      );
    }
    if (err instanceof CaptureProviderError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}

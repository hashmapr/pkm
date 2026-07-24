import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { InvalidAudioFileError, uploadAudio } from '@/lib/services/audio';

function parseCommaSeparated(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const audio = formData.get('audio');
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: 'Missing audio file (field "audio")' }, { status: 400 });
  }

  const title = formData.get('title');
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const buffer = Buffer.from(await audio.arrayBuffer());
  const filename = audio instanceof File ? audio.name : 'audio';
  const mimeType = audio.type || 'application/octet-stream';

  try {
    const { item, audioAttachment } = await uploadAudio(userId, {
      buffer,
      filename,
      mimeType,
      title,
      tags: parseCommaSeparated(formData.get('tags')),
      projects: parseCommaSeparated(formData.get('projects')),
    });
    return NextResponse.json({ item, audioAttachment }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidAudioFileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

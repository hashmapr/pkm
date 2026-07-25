import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth/session';
import { captureRequestSchema } from '@/lib/validation/capture';
import { captureItem } from '@/lib/services/capture';
import { CaptureProviderError, NoCaptureProviderError } from '@/lib/capture';

/**
 * The universal capture endpoint: one route, dispatched internally to
 * whichever CaptureProvider recognizes the input — plain text
 * (NoteCaptureProvider), YouTube/GitHub/generic-webpage URLs (Sub-Phase B).
 * Image/screenshot/PDF file capture is still Sub-Phase C; this route doesn't
 * change when those land, only the registry's contents do.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = captureRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await captureItem(userId, parsed.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof NoCaptureProviderError) {
      return NextResponse.json(
        { error: 'Nothing can capture this input yet (file/image capture lands in a follow-up)' },
        { status: 422 },
      );
    }
    if (err instanceof CaptureProviderError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}

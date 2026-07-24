import type { Prisma } from '@prisma/client';
import { getCaptureRegistry } from '@/lib/capture';
import type { CaptureInput, CaptureProviderRegistry } from '@/lib/capture';
import { createSavedItem } from './saved-items';

export interface CaptureItemInput extends CaptureInput {
  tags?: string[];
  projects?: string[];
}

/**
 * The one entry point for universal capture: normalize whatever was handed
 * in (a URL, pasted text, or a file) via whichever CaptureProvider
 * supports() it, then create the resulting SavedItem exactly the way
 * manual creation already does — same tags/projects handling, same
 * automatic ProcessingJob queuing.
 */
export async function captureItem(
  userId: string,
  input: CaptureItemInput,
  registry: CaptureProviderRegistry = getCaptureRegistry(),
) {
  const result = await registry.capture(input);

  return createSavedItem(userId, {
    type: result.type,
    title: result.title,
    source: result.source,
    content: result.content,
    metadata: result.metadata as Prisma.InputJsonValue | undefined,
    tags: input.tags,
    projects: input.projects,
  });
}

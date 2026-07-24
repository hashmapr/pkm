import type { SavedItemType } from '@prisma/client';

export interface CaptureInput {
  /** A URL to capture — a webpage, YouTube video, or GitHub repo, dispatched by whichever provider recognizes the host/pattern. */
  url?: string;
  /** Pasted or dictated text — a plain note when nothing else is set. */
  text?: string;
  /** A raw file — image, screenshot, PDF, audio. */
  file?: { buffer: Buffer; filename: string; mimeType: string };
  /** Optional user-provided title hint; providers may use it or override it with something better extracted from the content. */
  title?: string;
}

export interface CaptureResult {
  type: SavedItemType;
  title: string;
  source?: string;
  content?: string;
  /** Type-specific structured extraction data (YouTube chapters, GitHub languages, webpage author, etc.) — stored on SavedItem.metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Provider-agnostic capture: normalizes any input (URL, pasted text, file)
 * into the shape createSavedItem already expects. One provider per source
 * type (Web, YouTube, GitHub, PDF, Image, Screenshot, Voice) — see
 * ALBO_INTEGRATION_PLAN.md for which are implemented in which sub-phase.
 */
export interface CaptureProvider {
  /** The SavedItemType this provider produces — used for registry ordering/debugging, not dispatch itself. */
  readonly type: SavedItemType;
  supports(input: CaptureInput): boolean;
  capture(input: CaptureInput): Promise<CaptureResult>;
}

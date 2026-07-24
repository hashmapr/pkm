import { z } from 'zod';

/**
 * File-based capture (image/PDF/screenshot) isn't accepted here yet — those
 * providers don't exist until Sub-Phase C. This covers what's actually
 * dispatchable today: a URL (once Sub-Phase B's Web/YouTube/GitHub
 * providers exist) or plain text (NoteCaptureProvider, today).
 */
export const captureRequestSchema = z
  .object({
    url: z.string().trim().url().optional(),
    text: z.string().trim().min(1).max(200_000).optional(),
    title: z.string().trim().max(300).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
    projects: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .refine((data) => Boolean(data.url) || Boolean(data.text), {
    message: 'Provide either a url or text to capture',
  });

import { z } from 'zod';

export const savedItemTypeValues = [
  'VOICE',
  'LINK',
  'ARTICLE',
  'YOUTUBE',
  'GITHUB',
  'SCREENSHOT',
  'PDF',
  'IMAGE',
  'NOTE',
] as const;

export const createSavedItemSchema = z.object({
  type: z.enum(savedItemTypeValues),
  title: z.string().trim().min(1).max(300),
  source: z.string().trim().max(2000).optional(),
  content: z.string().max(200_000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  projects: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

export const updateSavedItemSchema = createSavedItemSchema.partial();

export const listSavedItemsQuerySchema = z.object({
  type: z.enum(savedItemTypeValues).optional(),
  tag: z.string().optional(),
  project: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

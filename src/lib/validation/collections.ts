import { z } from 'zod';

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  emoji: z.string().trim().max(8).optional(),
});

export const addItemToCollectionSchema = z.object({
  savedItemId: z.string().min(1),
});

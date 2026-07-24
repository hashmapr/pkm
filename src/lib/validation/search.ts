import { z } from 'zod';
import { savedItemTypeValues } from './saved-item';

export const searchQuerySchema = z.object({
  q: z.string().default(''),
  type: z.enum(savedItemTypeValues).optional(),
  project: z.string().optional(),
  tag: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

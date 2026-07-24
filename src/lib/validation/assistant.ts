import { z } from 'zod';

export const chatMessageSchema = z.object({
  conversationId: z.string().min(1).optional(),
  question: z.string().trim().min(1).max(2000),
  mode: z.enum(['ANSWER', 'SUMMARIZE', 'COMPARE', 'FIND_CONFLICTS']).default('ANSWER'),
});

const createProjectActionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
});

const createTaskActionSchema = z.object({
  savedItemId: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
});

const createDecisionActionSchema = z.object({
  savedItemId: z.string().min(1),
  statement: z.string().trim().min(1).max(1000),
  reasoning: z.string().trim().max(2000).optional(),
});

const addReminderActionSchema = z.object({
  savedItemId: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  dueDate: z.string().datetime(),
});

/**
 * A suggested action is only ever a label + payload proposed by the
 * assistant — nothing is written to the database until this schema
 * validates a POST to /api/assistant/actions/confirm, which only fires on
 * an explicit user button click. See ARCHITECTURE.md "Knowledge actions."
 */
export const confirmActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CREATE_PROJECT'), payload: createProjectActionSchema }),
  z.object({ type: z.literal('CREATE_TASK'), payload: createTaskActionSchema }),
  z.object({ type: z.literal('CREATE_DECISION'), payload: createDecisionActionSchema }),
  z.object({ type: z.literal('ADD_REMINDER'), payload: addReminderActionSchema }),
]);

export type ConfirmActionInput = z.infer<typeof confirmActionSchema>;

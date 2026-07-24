import { z } from 'zod';
import { AssistantResponseValidationError } from './errors';

const suggestedActionSchema = z.object({
  type: z.enum(['CREATE_TASK', 'CREATE_DECISION', 'CREATE_PROJECT', 'ADD_REMINDER']),
  label: z.string().trim().min(1),
  payload: z.record(z.unknown()).default({}),
});

export const assistantAnswerSchema = z.object({
  answer: z.string().trim().min(1),
  sourceIndexes: z.array(z.number().int().min(1)).default([]),
  confidence: z.number().min(0).max(1),
  suggestedActions: z.array(suggestedActionSchema).default([]),
});

export type AssistantAnswerRaw = z.infer<typeof assistantAnswerSchema>;

/**
 * Models sometimes wrap JSON in markdown code fences or add leading/trailing
 * prose despite instructions. Strip fences and grab the outermost {...}
 * before parsing. (Deliberately duplicated from ai/extraction.ts rather than
 * shared — same reasoning as the runXSafely wrappers being separate per
 * module: keeps this module independently readable, not recoupled to the
 * AI module it's supposed to be independent from.)
 */
function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;

  const trimmed = candidate.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return trimmed;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

export function parseAssistantAnswer(raw: string): AssistantAnswerRaw {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonPayload(raw));
  } catch (err) {
    throw new AssistantResponseValidationError('Assistant response was not valid JSON', raw, err);
  }

  const result = assistantAnswerSchema.safeParse(json);
  if (!result.success) {
    throw new AssistantResponseValidationError(
      'Assistant response did not match the expected shape',
      raw,
      result.error.flatten(),
    );
  }
  return result.data;
}

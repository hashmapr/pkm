import { z } from 'zod';
import { AIResponseValidationError } from './errors';

export const entityTypeValues = [
  'PERSON',
  'COMPANY',
  'TECHNOLOGY',
  'PROJECT',
  'BOOK',
  'URL',
  'CONCEPT',
] as const;

export const taskPriorityValues = ['LOW', 'MEDIUM', 'HIGH'] as const;

const confidence = z.number().min(0).max(1);

export const extractedEntitySchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(entityTypeValues),
  confidence,
});

export const extractedTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  priority: z.enum(taskPriorityValues).default('MEDIUM'),
  dueDate: z.string().datetime().nullish(),
  confidence,
});

export const decisionSchema = z.object({
  statement: z.string().trim().min(1),
  reasoning: z.string().trim().min(1).optional(),
  confidence,
});

export const questionSchema = z.object({
  question: z.string().trim().min(1),
});

export const classificationSchema = z.object({
  type: z.enum([
    'VOICE',
    'LINK',
    'ARTICLE',
    'YOUTUBE',
    'GITHUB',
    'SCREENSHOT',
    'PDF',
    'IMAGE',
    'NOTE',
  ]),
  confidence,
});

export const relationshipSuggestionSchema = z.object({
  relatedItemId: z.string().trim().min(1),
  score: confidence,
  reason: z.string().trim().min(1),
});

export const aiExtractionResultSchema = z.object({
  summary: z.string().trim().min(1),
  keyPoints: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  entities: z.array(extractedEntitySchema).default([]),
  tasks: z.array(extractedTaskSchema).default([]),
  decisions: z.array(decisionSchema).default([]),
  questions: z.array(questionSchema).default([]),
});

export type AIExtractionResult = z.infer<typeof aiExtractionResultSchema>;
export type ExtractedEntityResult = z.infer<typeof extractedEntitySchema>;
export type ExtractedTaskResult = z.infer<typeof extractedTaskSchema>;
export type DecisionResult = z.infer<typeof decisionSchema>;
export type QuestionResult = z.infer<typeof questionSchema>;
export type ClassificationResult = z.infer<typeof classificationSchema>;
export type RelationshipSuggestion = z.infer<typeof relationshipSuggestionSchema>;

/**
 * Models sometimes wrap JSON in markdown code fences or add leading/trailing
 * prose despite instructions. Strip fences and grab the outermost {...} or
 * [...] before parsing, so a well-formed-but-decorated response still validates.
 */
function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;

  const trimmed = candidate.trim();
  const firstBrace = Math.min(
    ...['{', '['].map((c) => {
      const idx = trimmed.indexOf(c);
      return idx === -1 ? Infinity : idx;
    }),
  );
  const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));

  if (!Number.isFinite(firstBrace) || lastBrace === -1 || lastBrace < firstBrace) {
    return trimmed;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function parseJson(raw: string): unknown {
  const payload = extractJsonPayload(raw);
  try {
    return JSON.parse(payload);
  } catch (err) {
    throw new AIResponseValidationError('AI response was not valid JSON', raw, err);
  }
}

/** Parses and validates a raw model response against the given schema, or throws AIResponseValidationError. */
export function parseWithSchema<T>(raw: string, schema: z.ZodType<T, z.ZodTypeDef, any>, label: string): T {
  const json = parseJson(raw);
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AIResponseValidationError(
      `AI response for ${label} did not match the expected shape`,
      raw,
      result.error.flatten(),
    );
  }
  return result.data;
}

export function parseExtractionResponse(raw: string): AIExtractionResult {
  return parseWithSchema(raw, aiExtractionResultSchema, 'analyze');
}

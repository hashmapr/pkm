import type { RelationshipCandidate, SavedItemForAnalysis } from './types';

export const JSON_ONLY_SYSTEM_PROMPT =
  'You are a knowledge-extraction assistant. Respond with a single JSON value only — ' +
  'no markdown code fences, no prose before or after, no explanations. If the content ' +
  'gives you nothing to extract for a field, return an empty array or empty string for ' +
  'it rather than omitting it or inventing content.';

function itemBlock(input: SavedItemForAnalysis): string {
  return `Item type: ${input.type}\nTitle: ${input.title}\nContent:\n${input.content}`;
}

export function buildAnalyzePrompt(input: SavedItemForAnalysis): string {
  return `Analyze this saved item and extract structured knowledge from it.

${itemBlock(input)}

Return JSON matching exactly this shape:
{
  "summary": string,
  "keyPoints": string[],
  "tags": string[] (lowercase, short, no leading '#'),
  "entities": [{ "name": string, "type": "PERSON"|"COMPANY"|"TECHNOLOGY"|"PROJECT"|"BOOK"|"URL"|"CONCEPT", "confidence": number 0-1 }],
  "tasks": [{ "title": string, "description": string?, "priority": "LOW"|"MEDIUM"|"HIGH", "dueDate": string (ISO 8601) | null, "confidence": number 0-1 }],
  "decisions": [{ "statement": string, "reasoning": string?, "confidence": number 0-1 }],
  "questions": [{ "question": string }]
}`;
}

export function buildSummarizePrompt(input: SavedItemForAnalysis): string {
  return `Summarize this saved item in 2-4 sentences.

${itemBlock(input)}

Return JSON: { "summary": string }`;
}

export function buildEntitiesPrompt(input: SavedItemForAnalysis): string {
  return `Extract named entities mentioned in this saved item.

${itemBlock(input)}

Return a JSON array: [{ "name": string, "type": "PERSON"|"COMPANY"|"TECHNOLOGY"|"PROJECT"|"BOOK"|"URL"|"CONCEPT", "confidence": number 0-1 }]`;
}

export function buildTasksPrompt(input: SavedItemForAnalysis): string {
  return `Extract actionable tasks mentioned or implied in this saved item. If there are none, return an empty array.

${itemBlock(input)}

Return a JSON array: [{ "title": string, "description": string?, "priority": "LOW"|"MEDIUM"|"HIGH", "dueDate": string (ISO 8601) | null, "confidence": number 0-1 }]`;
}

export function buildClassifyPrompt(input: SavedItemForAnalysis): string {
  return `Classify what kind of saved item this is.

${itemBlock(input)}

Return JSON: { "type": "VOICE"|"LINK"|"ARTICLE"|"YOUTUBE"|"GITHUB"|"SCREENSHOT"|"PDF"|"IMAGE"|"NOTE", "confidence": number 0-1 }`;
}

export function buildTagsPrompt(input: SavedItemForAnalysis): string {
  return `Generate concise, lowercase topical tags for this saved item (no leading '#', max 8 tags).

${itemBlock(input)}

Return a JSON array of strings: string[]`;
}

export function buildRelationshipsPrompt(
  input: SavedItemForAnalysis,
  candidates: RelationshipCandidate[],
): string {
  const candidateList = candidates
    .map((c) => `- id: ${c.id}, title: "${c.title}"${c.summary ? `, summary: "${c.summary}"` : ''}`)
    .join('\n');

  return `Given this saved item, decide which of the candidate items below (if any) are meaningfully related to it (same topic, project, or theme).

${itemBlock(input)}

Candidates:
${candidateList || '(none)'}

Return a JSON array: [{ "relatedItemId": string, "score": number 0-1, "reason": string }]. Only include candidates that are actually related; return an empty array if none are.`;
}

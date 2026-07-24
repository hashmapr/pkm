import type { ContextSource, ConversationTurn } from './types';

export const ASSISTANT_JSON_SYSTEM_PROMPT =
  'You are a personal knowledge assistant. You answer questions using ONLY the numbered ' +
  'sources provided in the prompt — never your own general knowledge. If the sources do not ' +
  'contain enough information to answer, say so explicitly in the answer field rather than ' +
  'guessing or filling gaps from what you already know. Respond with a single JSON value only — ' +
  'no markdown code fences, no prose before or after.';

const RESPONSE_SHAPE = `{
  "answer": string,
  "sourceIndexes": number[] (1-based indexes of the sources you actually drew from, e.g. [1, 3]),
  "confidence": number 0-1 (your own confidence in this answer given the sources),
  "suggestedActions": [{ "type": "CREATE_TASK"|"CREATE_DECISION"|"CREATE_PROJECT"|"ADD_REMINDER", "label": string, "payload": object }]
}`;

function formatSources(context: ContextSource[]): string {
  if (context.length === 0) return '(no sources found)';
  return context
    .map(
      (source, i) =>
        `[${i + 1}] (${source.entityType} — from "${source.savedItemTitle}", a ${source.savedItemType} saved on ${source.createdAt})\n${source.label}`,
    )
    .join('\n\n');
}

function formatHistory(history: ConversationTurn[]): string {
  if (history.length === 0) return '';
  return (
    'Conversation so far:\n' +
    history.map((turn) => `${turn.role}: ${turn.content}`).join('\n') +
    '\n\n'
  );
}

export function buildAnswerQuestionPrompt(question: string, context: ContextSource[], history: ConversationTurn[]): string {
  return `${formatHistory(history)}Sources:
${formatSources(context)}

Question: ${question}

Answer the question using only the sources above. Return JSON matching exactly this shape:
${RESPONSE_SHAPE}`;
}

export function buildSummarizeKnowledgePrompt(topic: string, context: ContextSource[], history: ConversationTurn[]): string {
  return `${formatHistory(history)}Sources:
${formatSources(context)}

Summarize everything in the sources above about: ${topic}

Return JSON matching exactly this shape:
${RESPONSE_SHAPE}`;
}

export function buildCompareKnowledgePrompt(question: string, context: ContextSource[], history: ConversationTurn[]): string {
  return `${formatHistory(history)}Sources:
${formatSources(context)}

Compare and contrast what the sources above say in response to: ${question}
Note where sources agree, disagree, or add different angles.

Return JSON matching exactly this shape:
${RESPONSE_SHAPE}`;
}

export function buildFindConflictsPrompt(question: string, context: ContextSource[], history: ConversationTurn[]): string {
  return `${formatHistory(history)}Sources:
${formatSources(context)}

Look for contradictions or inconsistencies among the sources above, specifically regarding: ${question}
If you find a genuine contradiction, describe exactly which sources disagree and how. If the
sources are all consistent, say so plainly rather than manufacturing a conflict.

Return JSON matching exactly this shape:
${RESPONSE_SHAPE}`;
}

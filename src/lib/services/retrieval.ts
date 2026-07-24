import { db } from '@/lib/db';
import { getEmbeddingProvider } from '@/lib/embeddings';
import type { EmbeddingProvider } from '@/lib/embeddings/types';
import type { ContextSource } from '@/lib/assistant/types';
import { toVectorLiteral } from './embedding-index';

/**
 * Retrieved context is capped and truncated deliberately (see
 * ARCHITECTURE.md "Context limits") — not because Claude's window would
 * overflow, but because more low-relevance sources dilute the model's
 * attention, cost more per call, and add latency for no accuracy benefit.
 */
export const CONTEXT_LIMIT = 8;
const LABEL_TRUNCATE_LENGTH = 600;

interface ContextRow {
  entityType: ContextSource['entityType'];
  entityId: string;
  savedItemId: string;
  savedItemTitle: string;
  savedItemType: ContextSource['savedItemType'];
  label: string;
  similarity: number;
  createdAt: Date;
}

function truncate(text: string): string {
  return text.length > LABEL_TRUNCATE_LENGTH ? `${text.slice(0, LABEL_TRUNCATE_LENGTH)}…` : text;
}

/**
 * Embeds the question and ranks across all five embedded entity types —
 * a Decision or ExtractedTask can be its own retrieved source, not just its
 * parent SavedItem's summary. No relevance floor: an empty result set (zero
 * rows) is what triggers the "missing information" guard in askAssistant;
 * consistent with Phase 4's /api/search, which also returns whatever ranks
 * highest rather than cutting off at an absolute score.
 */
export async function retrieveContextForQuestion(
  userId: string,
  question: string,
  provider: EmbeddingProvider = getEmbeddingProvider(),
  limit: number = CONTEXT_LIMIT,
): Promise<ContextSource[]> {
  const queryVector = await provider.generateEmbedding(question);
  const vectorLiteral = toVectorLiteral(queryVector);

  const rows = await db.$queryRaw<ContextRow[]>`
    SELECT * FROM (
      (SELECT 'SAVED_ITEM' AS "entityType", si.id AS "entityId", si.id AS "savedItemId",
              si.title AS "savedItemTitle", si.type AS "savedItemType",
              COALESCE(si.summary, LEFT(si.content, ${LABEL_TRUNCATE_LENGTH}::int), si.title) AS label,
              1 - (e.vector <=> ${vectorLiteral}::vector) AS similarity, si."createdAt"
       FROM embeddings e
       JOIN saved_items si ON si.id = e."entityId"
       WHERE e."entityType" = 'SAVED_ITEM' AND si."userId" = ${userId})
      UNION ALL
      (SELECT 'EXTRACTED_TASK', t.id, t."savedItemId", si.title, si.type,
              CASE WHEN t.description IS NOT NULL THEN t.title || ': ' || t.description ELSE t.title END,
              1 - (e.vector <=> ${vectorLiteral}::vector), si."createdAt"
       FROM embeddings e
       JOIN extracted_tasks t ON t.id = e."entityId"
       JOIN saved_items si ON si.id = t."savedItemId"
       WHERE e."entityType" = 'EXTRACTED_TASK' AND si."userId" = ${userId})
      UNION ALL
      (SELECT 'DECISION', d.id, d."savedItemId", si.title, si.type,
              CASE WHEN d.reasoning IS NOT NULL THEN d.statement || ' — ' || d.reasoning ELSE d.statement END,
              1 - (e.vector <=> ${vectorLiteral}::vector), si."createdAt"
       FROM embeddings e
       JOIN decisions d ON d.id = e."entityId"
       JOIN saved_items si ON si.id = d."savedItemId"
       WHERE e."entityType" = 'DECISION' AND si."userId" = ${userId})
      UNION ALL
      (SELECT 'QUESTION', q.id, q."savedItemId", si.title, si.type, q.question,
              1 - (e.vector <=> ${vectorLiteral}::vector), si."createdAt"
       FROM embeddings e
       JOIN questions q ON q.id = e."entityId"
       JOIN saved_items si ON si.id = q."savedItemId"
       WHERE e."entityType" = 'QUESTION' AND si."userId" = ${userId})
      UNION ALL
      (SELECT 'ENTITY', en.id, en."savedItemId", si.title, si.type,
              en.name || ' (' || en.type || ')',
              1 - (e.vector <=> ${vectorLiteral}::vector), si."createdAt"
       FROM embeddings e
       JOIN extracted_entities en ON en.id = e."entityId"
       JOIN saved_items si ON si.id = en."savedItemId"
       WHERE e."entityType" = 'ENTITY' AND si."userId" = ${userId})
    ) combined
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    savedItemId: row.savedItemId,
    savedItemTitle: row.savedItemTitle,
    savedItemType: row.savedItemType,
    label: truncate(row.label),
    similarity: row.similarity,
    createdAt: row.createdAt.toISOString(),
  }));
}

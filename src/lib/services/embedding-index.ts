import { randomUUID } from 'node:crypto';
import type { Decision, ExtractedEntity, ExtractedTask, Question, SavedItem } from '@prisma/client';
import { db } from '@/lib/db';
import { EmbeddingProviderError } from '@/lib/embeddings/errors';
import type { EmbeddingProvider } from '@/lib/embeddings/types';

export type EmbeddingEntityType = 'SAVED_ITEM' | 'EXTRACTED_TASK' | 'DECISION' | 'QUESTION' | 'ENTITY';

const CONTENT_SLICE_LENGTH = 2000;

export function textForSavedItem(item: Pick<SavedItem, 'title' | 'summary' | 'keyPoints' | 'content'>): string {
  return [item.title, item.summary, item.keyPoints.join('. '), item.content?.slice(0, CONTENT_SLICE_LENGTH)]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n\n');
}

export function textForTask(task: Pick<ExtractedTask, 'title' | 'description'>): string {
  return task.description ? `${task.title}: ${task.description}` : task.title;
}

export function textForDecision(decision: Pick<Decision, 'statement' | 'reasoning'>): string {
  return decision.reasoning ? `${decision.statement} — ${decision.reasoning}` : decision.statement;
}

export function textForQuestion(question: Pick<Question, 'question'>): string {
  return question.question;
}

export function textForEntity(entity: Pick<ExtractedEntity, 'name' | 'type'>): string {
  return `${entity.name} (${entity.type})`;
}

/** Turns a JS embedding vector into the string literal pgvector expects, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export type EmbeddingBatchOutcome =
  | { success: true; data: number[][] }
  | { success: false; error: string };

/**
 * Runs the embedding provider and normalizes every failure mode into a
 * discriminated result instead of throwing — mirrors runExtractionSafely
 * (processing.ts) and runTranscriptionSafely (audio.ts). Depends only on its
 * arguments, so it's directly unit-testable with a fake provider.
 */
export async function runEmbeddingSafely(
  provider: EmbeddingProvider,
  texts: string[],
): Promise<EmbeddingBatchOutcome> {
  try {
    const data = await provider.generateEmbeddings(texts);
    return { success: true, data };
  } catch (err) {
    if (err instanceof EmbeddingProviderError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown embedding error' };
  }
}

async function upsertEmbedding(
  entityType: EmbeddingEntityType,
  entityId: string,
  vector: number[],
  model: string,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO embeddings (id, "entityType", "entityId", vector, model, "createdAt")
    VALUES (${randomUUID()}, ${entityType}::"EmbeddingEntityType", ${entityId}, ${toVectorLiteral(vector)}::vector, ${model}, now())
    ON CONFLICT ("entityType", "entityId")
    DO UPDATE SET vector = EXCLUDED.vector, model = EXCLUDED.model, "createdAt" = now()
  `;
}

/**
 * Extracted tasks/decisions/questions/entities get new ids every reprocess
 * (Phase 2 deletes-and-recreates them), so their old embedding rows would
 * otherwise leak forever. Rather than thread old ids through Phase 2's
 * transaction, this just removes embeddings whose parent row no longer
 * exists — correct regardless of when/how rows were deleted, and cheap at
 * personal-app scale.
 */
export async function cleanupOrphanedEmbeddings(): Promise<void> {
  await db.$executeRaw`
    DELETE FROM embeddings e
    WHERE e."entityType" = 'EXTRACTED_TASK'
      AND NOT EXISTS (SELECT 1 FROM extracted_tasks t WHERE t.id = e."entityId")
  `;
  await db.$executeRaw`
    DELETE FROM embeddings e
    WHERE e."entityType" = 'DECISION'
      AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.id = e."entityId")
  `;
  await db.$executeRaw`
    DELETE FROM embeddings e
    WHERE e."entityType" = 'QUESTION'
      AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = e."entityId")
  `;
  await db.$executeRaw`
    DELETE FROM embeddings e
    WHERE e."entityType" = 'ENTITY'
      AND NOT EXISTS (SELECT 1 FROM extracted_entities en WHERE en.id = e."entityId")
  `;
}

interface EmbeddingJob {
  entityType: EmbeddingEntityType;
  entityId: string;
  text: string;
}

function buildEmbeddingJobs(item: SavedItem & {
  extractedTasks: ExtractedTask[];
  decisions: Decision[];
  questions: Question[];
  extractedEntities: ExtractedEntity[];
}): EmbeddingJob[] {
  const jobs: EmbeddingJob[] = [
    { entityType: 'SAVED_ITEM', entityId: item.id, text: textForSavedItem(item) },
    ...item.extractedTasks.map((t) => ({ entityType: 'EXTRACTED_TASK' as const, entityId: t.id, text: textForTask(t) })),
    ...item.decisions.map((d) => ({ entityType: 'DECISION' as const, entityId: d.id, text: textForDecision(d) })),
    ...item.questions.map((q) => ({ entityType: 'QUESTION' as const, entityId: q.id, text: textForQuestion(q) })),
    ...item.extractedEntities.map((e) => ({ entityType: 'ENTITY' as const, entityId: e.id, text: textForEntity(e) })),
  ];
  return jobs.filter((job) => job.text.trim().length > 0);
}

/**
 * Generates and stores embeddings for a saved item and its extracted
 * knowledge (tasks/decisions/questions/entities). Called from
 * processing.ts's runProcessingJob right after a job completes — failures
 * here are swallowed by the caller so a search-indexing problem never fails
 * the underlying AI processing job.
 */
export async function indexSavedItemEmbeddings(
  userId: string,
  savedItemId: string,
  provider: EmbeddingProvider,
): Promise<void> {
  const item = await db.savedItem.findFirst({
    where: { id: savedItemId, userId },
    include: { extractedTasks: true, decisions: true, questions: true, extractedEntities: true },
  });
  if (!item) return;

  const jobs = buildEmbeddingJobs(item);
  if (jobs.length === 0) return;

  const outcome = await runEmbeddingSafely(provider, jobs.map((j) => j.text));
  if (!outcome.success) {
    throw new Error(`Embedding generation failed: ${outcome.error}`);
  }

  await cleanupOrphanedEmbeddings();
  await Promise.all(
    jobs.map((job, i) => upsertEmbedding(job.entityType, job.entityId, outcome.data[i], provider.model)),
  );
}

import { ProcessingJob } from '@prisma/client';
import { db } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import { AIProviderError, AIResponseValidationError } from '@/lib/ai/errors';
import type { AIExtractionResult } from '@/lib/ai/extraction';
import type { AIProvider, SavedItemForAnalysis } from '@/lib/ai/types';
import { getEmbeddingProvider } from '@/lib/embeddings';
import type { EmbeddingProvider } from '@/lib/embeddings/types';
import { indexSavedItemEmbeddings } from './embedding-index';
import { upsertTagsByName } from './tags';

export class SavedItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Saved item ${id} not found`);
    this.name = 'SavedItemNotFoundError';
  }
}

export class ProcessingJobNotFoundError extends Error {
  constructor(id: string) {
    super(`Processing job ${id} not found`);
    this.name = 'ProcessingJobNotFoundError';
  }
}

/** An item with no meaningful content can't be analyzed — fail fast without spending an AI call. */
export function hasProcessableContent(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.trim().length > 0;
}

export type ExtractionOutcome =
  | { success: true; data: AIExtractionResult }
  | { success: false; error: string };

/**
 * Runs the AI provider's combined analysis and normalizes every failure mode
 * (upstream API errors, malformed JSON, schema violations, anything else)
 * into a single discriminated result instead of throwing. Depends only on its
 * arguments, not the database, so it's directly unit-testable with a fake
 * provider.
 */
export async function runExtractionSafely(
  provider: AIProvider,
  input: SavedItemForAnalysis,
): Promise<ExtractionOutcome> {
  try {
    const data = await provider.analyze(input);
    return { success: true, data };
  } catch (err) {
    if (err instanceof AIResponseValidationError || err instanceof AIProviderError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown processing error' };
  }
}

/** Queues a processing job for a saved item. Called on create/update; does not run the AI call. */
export async function createProcessingJobForItem(savedItemId: string): Promise<ProcessingJob> {
  const [job] = await db.$transaction([
    db.processingJob.create({ data: { savedItemId, status: 'PENDING' } }),
    db.savedItem.update({ where: { id: savedItemId }, data: { status: 'PENDING' } }),
  ]);
  return job;
}

async function persistExtractionResult(
  userId: string,
  savedItemId: string,
  result: AIExtractionResult,
  existingSaveReason: string | null,
): Promise<void> {
  const tagIds = await upsertTagsByName(userId, result.tags);

  await db.$transaction([
    db.savedItem.update({
      where: { id: savedItemId },
      data: {
        summary: result.summary,
        keyPoints: result.keyPoints,
        status: 'COMPLETED',
        importanceScore: result.importanceScore,
        // A user-edited saveReason should never be silently clobbered by a
        // reprocess — same principle as the tag-merge below. Only ever set
        // by AI the first time; a null existing value is the "never edited,
        // never set" state.
        saveReason: existingSaveReason ?? result.saveReason,
      },
    }),
    // AI-generated tags are merged in alongside any the user already set —
    // reprocessing should never silently remove a manual tag. skipDuplicates
    // handles the case where the AI suggests a tag already attached.
    db.savedItemTag.createMany({
      data: tagIds.map((tagId) => ({ savedItemId, tagId })),
      skipDuplicates: true,
    }),
    db.extractedTask.deleteMany({ where: { savedItemId } }),
    db.extractedTask.createMany({
      data: result.tasks.map((task) => ({
        savedItemId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        confidence: task.confidence,
      })),
    }),
    db.extractedEntity.deleteMany({ where: { savedItemId } }),
    db.extractedEntity.createMany({
      data: result.entities.map((entity) => ({
        savedItemId,
        name: entity.name,
        type: entity.type,
        confidence: entity.confidence,
      })),
    }),
    db.decision.deleteMany({ where: { savedItemId } }),
    db.decision.createMany({
      data: result.decisions.map((decision) => ({
        savedItemId,
        statement: decision.statement,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
      })),
    }),
    db.question.deleteMany({ where: { savedItemId } }),
    db.question.createMany({
      data: result.questions.map((question) => ({
        savedItemId,
        question: question.question,
      })),
    }),
  ]);
}

/** Runs an existing processing job end-to-end: PENDING -> PROCESSING -> COMPLETED|FAILED. */
export async function runProcessingJob(
  jobId: string,
  provider: AIProvider = getAIProvider(),
  embeddingProvider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<ProcessingJob> {
  const job = await db.processingJob.findUnique({
    where: { id: jobId },
    include: { savedItem: true },
  });
  if (!job) throw new ProcessingJobNotFoundError(jobId);

  await db.$transaction([
    db.processingJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', startedAt: new Date() } }),
    db.savedItem.update({ where: { id: job.savedItemId }, data: { status: 'PROCESSING' } }),
  ]);

  const { savedItem } = job;

  if (!hasProcessableContent(savedItem.content)) {
    return failJob(jobId, savedItem.id, 'Item has no content to process');
  }

  const outcome = await runExtractionSafely(provider, {
    type: savedItem.type,
    title: savedItem.title,
    content: savedItem.content ?? '',
  });

  if (!outcome.success) {
    return failJob(jobId, savedItem.id, outcome.error);
  }

  await persistExtractionResult(savedItem.userId, savedItem.id, outcome.data, savedItem.saveReason);

  const completedJob = await db.processingJob.update({
    where: { id: jobId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  // Search indexing is supplementary — a failure here means this item is
  // temporarily unsearchable, not that the processing job should be marked
  // FAILED after already succeeding.
  try {
    await indexSavedItemEmbeddings(savedItem.userId, savedItem.id, embeddingProvider);
  } catch {
    // swallowed intentionally; see comment above
  }

  return completedJob;
}

async function failJob(jobId: string, savedItemId: string, error: string): Promise<ProcessingJob> {
  const [job] = await db.$transaction([
    db.processingJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error, completedAt: new Date() },
    }),
    db.savedItem.update({ where: { id: savedItemId }, data: { status: 'FAILED' } }),
  ]);
  return job;
}

/** Creates and immediately runs a processing job for a saved item owned by userId. */
export async function processSavedItem(
  userId: string,
  savedItemId: string,
  provider: AIProvider = getAIProvider(),
  embeddingProvider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<ProcessingJob> {
  const item = await db.savedItem.findFirst({ where: { id: savedItemId, userId } });
  if (!item) throw new SavedItemNotFoundError(savedItemId);

  const job = await db.processingJob.create({ data: { savedItemId, status: 'PENDING' } });
  return runProcessingJob(job.id, provider, embeddingProvider);
}

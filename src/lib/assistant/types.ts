import type { SavedItemType } from '@prisma/client';
import type { AssistantAnswerRaw } from './schemas';

export type ContextEntityType = 'SAVED_ITEM' | 'EXTRACTED_TASK' | 'DECISION' | 'QUESTION' | 'ENTITY';

/**
 * One retrieved, citable piece of knowledge. A Decision and its parent
 * SavedItem are two separate ContextSources — matching the "Sources:
 * Recording from July 12, GitHub repository, Decision entry" example, where
 * a decision is its own listed source, not folded into its parent item.
 */
export interface ContextSource {
  entityType: ContextEntityType;
  entityId: string;
  savedItemId: string;
  savedItemTitle: string;
  savedItemType: SavedItemType;
  label: string;
  similarity: number;
  createdAt: string;
}

export interface ConversationTurn {
  role: 'USER' | 'ASSISTANT';
  content: string;
}

export interface AssistantQueryInput {
  question: string;
  /** Numbered 1..N when built into a prompt; sourceIndexes in the answer refer back to this order. */
  context: ContextSource[];
  history: ConversationTurn[];
}

export type SuggestedActionType = 'CREATE_TASK' | 'CREATE_DECISION' | 'CREATE_PROJECT' | 'ADD_REMINDER';

export interface SuggestedAction {
  type: SuggestedActionType;
  label: string;
  payload: Record<string, unknown>;
}

/** Canonical shape is AssistantAnswerRaw (zod-inferred, schemas.ts); this is just the public name for it. */
export type AssistantAnswer = AssistantAnswerRaw;

/**
 * Provider-agnostic conversational RAG over retrieved context. Its own
 * interface — not new methods on AIProvider — since it's a different
 * capability (multi-turn Q&A grounded in supplied sources) from a
 * potentially different vendor, same reasoning as Transcription/Embeddings
 * being separate from AI in Phases 3-4.
 */
export interface AssistantProvider {
  answerQuestion(input: AssistantQueryInput): Promise<AssistantAnswer>;
  summarizeKnowledge(input: AssistantQueryInput): Promise<AssistantAnswer>;
  compareKnowledge(input: AssistantQueryInput): Promise<AssistantAnswer>;
  findConflicts(input: AssistantQueryInput): Promise<AssistantAnswer>;
}

export type { AssistantAnswerRaw };

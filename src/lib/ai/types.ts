import type { SavedItemType } from '@prisma/client';
import type {
  AIExtractionResult,
  ClassificationResult,
  DecisionResult,
  ExtractedEntityResult,
  ExtractedTaskResult,
  QuestionResult,
  RelationshipSuggestion,
} from './extraction';

export interface SavedItemForAnalysis {
  type: SavedItemType;
  title: string;
  content: string;
}

export interface RelationshipCandidate {
  id: string;
  title: string;
  summary?: string | null;
}

/**
 * Provider-agnostic AI capability surface. Swapping models means writing a new
 * implementation of this interface — nothing that calls it should know or care
 * which vendor is behind it.
 */
export interface AIProvider {
  summarize(input: SavedItemForAnalysis): Promise<string>;
  extractEntities(input: SavedItemForAnalysis): Promise<ExtractedEntityResult[]>;
  extractTasks(input: SavedItemForAnalysis): Promise<ExtractedTaskResult[]>;
  classifyItem(input: SavedItemForAnalysis): Promise<ClassificationResult>;
  generateTags(input: SavedItemForAnalysis): Promise<string[]>;
  findRelationships(
    input: SavedItemForAnalysis,
    candidates: RelationshipCandidate[],
  ): Promise<RelationshipSuggestion[]>;

  /**
   * Single-call combined extraction (summary + keyPoints + tags + entities +
   * tasks + decisions + questions). This is what the processing pipeline uses —
   * one model call per item instead of six.
   */
  analyze(input: SavedItemForAnalysis): Promise<AIExtractionResult>;
}

export type { AIExtractionResult, DecisionResult, QuestionResult };

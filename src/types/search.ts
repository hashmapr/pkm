import type { SavedItemType } from './saved-item';

export interface SearchResultItemDto {
  id: string;
  type: SavedItemType;
  title: string;
  summary: string | null;
  createdAt: string;
  similarity: number;
  highlight: string;
}

export interface RelatedObjectDto {
  entityType: 'EXTRACTED_TASK' | 'DECISION' | 'QUESTION' | 'ENTITY';
  entityId: string;
  label: string;
  savedItemId: string;
  savedItemTitle: string;
  similarity: number;
}

export interface SearchResponseDto {
  items: SearchResultItemDto[];
  relatedObjects: RelatedObjectDto[];
}

export const RELATED_OBJECT_TYPE_LABELS: Record<RelatedObjectDto['entityType'], string> = {
  EXTRACTED_TASK: 'Task',
  DECISION: 'Decision',
  QUESTION: 'Question',
  ENTITY: 'Entity',
};

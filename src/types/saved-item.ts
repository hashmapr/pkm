export type SavedItemType =
  | 'VOICE'
  | 'LINK'
  | 'ARTICLE'
  | 'YOUTUBE'
  | 'GITHUB'
  | 'SCREENSHOT'
  | 'PDF'
  | 'IMAGE'
  | 'NOTE';

export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type EntityType = 'PERSON' | 'COMPANY' | 'TECHNOLOGY' | 'PROJECT' | 'BOOK' | 'URL' | 'CONCEPT';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type QuestionStatus = 'OPEN' | 'ANSWERED' | 'DISMISSED';

export interface SavedItemTagDto {
  tag: { id: string; name: string };
}

export interface SavedItemProjectDto {
  project: { id: string; name: string };
}

export interface SavedItemCollectionDto {
  collection: { id: string; name: string; emoji: string | null };
}

export interface ExtractedTaskDto {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  confidence: number;
}

export interface ExtractedEntityDto {
  id: string;
  name: string;
  type: EntityType;
  confidence: number;
}

export interface DecisionDto {
  id: string;
  statement: string;
  reasoning: string | null;
  confidence: number;
}

export interface QuestionDto {
  id: string;
  question: string;
  status: QuestionStatus;
}

export interface ProcessingJobDto {
  id: string;
  status: ProcessingStatus;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SavedItemDto {
  id: string;
  type: SavedItemType;
  title: string;
  source: string | null;
  content: string | null;
  summary: string | null;
  keyPoints: string[];
  status: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
  importanceScore: number | null;
  saveReason: string | null;
  tags: SavedItemTagDto[];
  projects: SavedItemProjectDto[];
  collections: SavedItemCollectionDto[];
  extractedTasks: ExtractedTaskDto[];
  extractedEntities: ExtractedEntityDto[];
  decisions: DecisionDto[];
  questions: QuestionDto[];
  processingJobs: ProcessingJobDto[];
}

export const SAVED_ITEM_TYPES: SavedItemType[] = [
  'NOTE',
  'LINK',
  'ARTICLE',
  'YOUTUBE',
  'GITHUB',
  'VOICE',
  'SCREENSHOT',
  'PDF',
  'IMAGE',
];

export const SAVED_ITEM_TYPE_LABELS: Record<SavedItemType, string> = {
  NOTE: 'Note',
  LINK: 'Link',
  ARTICLE: 'Article',
  YOUTUBE: 'YouTube',
  GITHUB: 'GitHub repo',
  VOICE: 'Voice recording',
  SCREENSHOT: 'Screenshot',
  PDF: 'PDF',
  IMAGE: 'Image',
};

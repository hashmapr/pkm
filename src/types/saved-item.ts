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

export type SavedItemStatus = 'NEW' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface SavedItemTagDto {
  tag: { id: string; name: string };
}

export interface SavedItemProjectDto {
  project: { id: string; name: string };
}

export interface SavedItemDto {
  id: string;
  type: SavedItemType;
  title: string;
  source: string | null;
  content: string | null;
  summary: string | null;
  status: SavedItemStatus;
  createdAt: string;
  updatedAt: string;
  tags: SavedItemTagDto[];
  projects: SavedItemProjectDto[];
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

export type MessageRole = 'USER' | 'ASSISTANT';
export type AssistantMode = 'ANSWER' | 'SUMMARIZE' | 'COMPARE' | 'FIND_CONFLICTS';

export interface ContextSourceDto {
  entityType: 'SAVED_ITEM' | 'EXTRACTED_TASK' | 'DECISION' | 'QUESTION' | 'ENTITY';
  entityId: string;
  savedItemId: string;
  savedItemTitle: string;
  savedItemType: string;
  label: string;
  similarity: number;
  createdAt: string;
}

export interface SuggestedActionDto {
  type: 'CREATE_TASK' | 'CREATE_DECISION' | 'CREATE_PROJECT' | 'ADD_REMINDER';
  label: string;
  payload: Record<string, unknown>;
}

export interface SourcesUsedDto {
  sources: ContextSourceDto[];
  relatedItems: ContextSourceDto[];
  confidence: number;
  suggestedActions: SuggestedActionDto[];
}

export interface MessageDto {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  sourcesUsed: SourcesUsedDto | null;
  createdAt: string;
}

export interface ConversationDto {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessagesDto extends ConversationDto {
  messages: MessageDto[];
}

export const ENTITY_TYPE_LABELS: Record<ContextSourceDto['entityType'], string> = {
  SAVED_ITEM: 'Saved item',
  EXTRACTED_TASK: 'Task',
  DECISION: 'Decision',
  QUESTION: 'Question',
  ENTITY: 'Entity',
};

export const ASSISTANT_MODE_LABELS: Record<AssistantMode, string> = {
  ANSWER: 'Ask',
  SUMMARIZE: 'Summarize',
  COMPARE: 'Compare',
  FIND_CONFLICTS: 'Find conflicts',
};

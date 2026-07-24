import { Conversation, Message, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getAssistantProvider } from '@/lib/assistant';
import { AssistantProviderError, AssistantResponseValidationError } from '@/lib/assistant/errors';
import type { AssistantAnswer, AssistantProvider, ContextSource, ConversationTurn } from '@/lib/assistant/types';
import { getEmbeddingProvider } from '@/lib/embeddings';
import type { EmbeddingProvider } from '@/lib/embeddings/types';
import { retrieveContextForQuestion } from './retrieval';

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation ${id} not found`);
    this.name = 'ConversationNotFoundError';
  }
}

export type AssistantMode = 'ANSWER' | 'SUMMARIZE' | 'COMPARE' | 'FIND_CONFLICTS';

const HISTORY_LIMIT = 10;
const TITLE_LENGTH = 80;

const NO_CONTEXT_ANSWER: AssistantAnswer = {
  answer: "I don't have any saved information about that yet — try saving something related first.",
  sourceIndexes: [],
  confidence: 0,
  suggestedActions: [],
};

const ERROR_ANSWER: AssistantAnswer = {
  answer: 'Something went wrong answering that question. Please try again.',
  sourceIndexes: [],
  confidence: 0,
  suggestedActions: [],
};

export type AssistantOutcome = { success: true; data: AssistantAnswer } | { success: false; error: string };

/**
 * Runs the assistant provider and normalizes every failure mode into a
 * discriminated result instead of throwing — mirrors runExtractionSafely
 * (processing.ts), runTranscriptionSafely (audio.ts), runEmbeddingSafely
 * (embedding-index.ts). Depends only on its arguments, so it's directly
 * unit-testable with a fake provider.
 */
export async function runAssistantSafely(
  provider: AssistantProvider,
  mode: AssistantMode,
  input: { question: string; context: ContextSource[]; history: ConversationTurn[] },
): Promise<AssistantOutcome> {
  try {
    const method = {
      ANSWER: provider.answerQuestion,
      SUMMARIZE: provider.summarizeKnowledge,
      COMPARE: provider.compareKnowledge,
      FIND_CONFLICTS: provider.findConflicts,
    }[mode].bind(provider);

    const data = await method(input);
    return { success: true, data };
  } catch (err) {
    if (err instanceof AssistantResponseValidationError || err instanceof AssistantProviderError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Unknown assistant error' };
  }
}

/**
 * Drops any sourceIndex the model returned that isn't actually a valid
 * position in the context that was sent — the concrete server-side defense
 * against a fabricated citation (see ARCHITECTURE.md "hallucination
 * prevention"). De-duplicates too.
 */
export function validateSourceIndexes(indexes: number[], contextLength: number): number[] {
  return Array.from(new Set(indexes.filter((i) => Number.isInteger(i) && i >= 1 && i <= contextLength))).sort(
    (a, b) => a - b,
  );
}

async function getOrCreateConversation(userId: string, conversationId?: string): Promise<Conversation> {
  if (conversationId) {
    const conversation = await db.conversation.findFirst({ where: { id: conversationId, userId } });
    if (!conversation) throw new ConversationNotFoundError(conversationId);
    return conversation;
  }
  return db.conversation.create({ data: { userId } });
}

async function loadHistory(conversationId: string): Promise<ConversationTurn[]> {
  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });
  return messages.reverse().map((m) => ({ role: m.role, content: m.content }));
}

export interface AskAssistantResult {
  conversation: Conversation;
  userMessage: Message;
  assistantMessage: Message;
  context: ContextSource[];
}

/**
 * Full RAG turn: persist the user's question, retrieve context, call the
 * assistant (or short-circuit if nothing was retrieved), validate citations,
 * and persist the assistant's reply with its full structured response
 * snapshot. See ARCHITECTURE.md for the end-to-end flow diagram.
 */
export async function askAssistant(
  userId: string,
  question: string,
  conversationId?: string,
  mode: AssistantMode = 'ANSWER',
  provider: AssistantProvider = getAssistantProvider(),
  embeddingProvider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<AskAssistantResult> {
  const conversation = await getOrCreateConversation(userId, conversationId);
  const isNewConversation = !conversation.title;

  const history = await loadHistory(conversation.id);

  const userMessage = await db.message.create({
    data: { conversationId: conversation.id, role: 'USER', content: question },
  });

  if (isNewConversation) {
    await db.conversation.update({
      where: { id: conversation.id },
      data: { title: question.slice(0, TITLE_LENGTH) },
    });
  }

  const context = await retrieveContextForQuestion(userId, question, embeddingProvider);

  let answer: AssistantAnswer;

  if (context.length === 0) {
    answer = NO_CONTEXT_ANSWER;
  } else {
    const outcome = await runAssistantSafely(provider, mode, { question, context, history });
    if (outcome.success) {
      answer = { ...outcome.data, sourceIndexes: validateSourceIndexes(outcome.data.sourceIndexes, context.length) };
    } else {
      answer = ERROR_ANSWER;
    }
  }

  const citedSources = answer.sourceIndexes.map((i) => context[i - 1]);
  const citedIndexSet = new Set(answer.sourceIndexes);
  const relatedItems = context.filter((_, i) => !citedIndexSet.has(i + 1));

  const assistantMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content: answer.answer,
      sourcesUsed: {
        sources: citedSources,
        relatedItems,
        confidence: answer.confidence,
        suggestedActions: answer.suggestedActions,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  return { conversation, userMessage, assistantMessage, context };
}

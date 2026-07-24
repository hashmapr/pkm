import { db } from '@/lib/db';
import { createProject } from './projects';
import type { ConfirmActionInput } from '@/lib/validation/assistant';

export class SavedItemNotFoundForActionError extends Error {
  constructor(savedItemId: string) {
    super(`Saved item ${savedItemId} not found`);
    this.name = 'SavedItemNotFoundForActionError';
  }
}

async function assertOwnsSavedItem(userId: string, savedItemId: string): Promise<void> {
  const item = await db.savedItem.findFirst({ where: { id: savedItemId, userId } });
  if (!item) throw new SavedItemNotFoundForActionError(savedItemId);
}

/**
 * Executes a suggested action the user explicitly confirmed. Nothing here
 * runs from the chat response path itself — this is the only place any of
 * these four action types touch the database, and it's only reachable via
 * an explicit POST triggered by a button click, never automatically.
 */
export async function confirmSuggestedAction(userId: string, input: ConfirmActionInput) {
  switch (input.type) {
    case 'CREATE_PROJECT': {
      const project = await createProject(userId, input.payload.name, input.payload.description);
      return { type: input.type, project };
    }

    case 'CREATE_TASK': {
      await assertOwnsSavedItem(userId, input.payload.savedItemId);
      const task = await db.extractedTask.create({
        data: {
          savedItemId: input.payload.savedItemId,
          title: input.payload.title,
          description: input.payload.description,
          priority: input.payload.priority,
          dueDate: input.payload.dueDate ? new Date(input.payload.dueDate) : null,
          confidence: 1, // user-confirmed, not AI-inferred
        },
      });
      return { type: input.type, task };
    }

    case 'CREATE_DECISION': {
      await assertOwnsSavedItem(userId, input.payload.savedItemId);
      const decision = await db.decision.create({
        data: {
          savedItemId: input.payload.savedItemId,
          statement: input.payload.statement,
          reasoning: input.payload.reasoning,
          confidence: 1,
        },
      });
      return { type: input.type, decision };
    }

    case 'ADD_REMINDER': {
      // Modeled as an ExtractedTask with a due date — this phase's schema
      // didn't ask for a separate Reminder entity, and a reminder is
      // structurally just a task with a deadline.
      await assertOwnsSavedItem(userId, input.payload.savedItemId);
      const reminder = await db.extractedTask.create({
        data: {
          savedItemId: input.payload.savedItemId,
          title: input.payload.title,
          priority: 'MEDIUM',
          dueDate: new Date(input.payload.dueDate),
          confidence: 1,
        },
      });
      return { type: input.type, reminder };
    }
  }
}

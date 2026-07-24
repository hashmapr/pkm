import { db } from '@/lib/db';

export class CollectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Collection ${id} not found`);
    this.name = 'CollectionNotFoundError';
  }
}

export async function listCollections(userId: string) {
  return db.collection.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

export async function getCollectionWithItems(userId: string, id: string) {
  return db.collection.findFirst({
    where: { id, userId },
    include: {
      items: {
        orderBy: { addedAt: 'desc' },
        include: { savedItem: true },
      },
    },
  });
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  emoji?: string;
  isAiSuggested?: boolean;
}

export async function createCollection(userId: string, input: CreateCollectionInput) {
  return db.collection.create({
    data: {
      userId,
      name: input.name.trim(),
      description: input.description,
      emoji: input.emoji,
      isAiSuggested: input.isAiSuggested ?? false,
    },
  });
}

export async function deleteCollection(userId: string, id: string): Promise<boolean> {
  const existing = await db.collection.findFirst({ where: { id, userId } });
  if (!existing) return false;
  await db.collection.delete({ where: { id } });
  return true;
}

/** Adds a saved item to a collection. Idempotent — re-adding an already-member item is a no-op. */
export async function addItemToCollection(userId: string, collectionId: string, savedItemId: string): Promise<void> {
  const [collection, item] = await Promise.all([
    db.collection.findFirst({ where: { id: collectionId, userId } }),
    db.savedItem.findFirst({ where: { id: savedItemId, userId } }),
  ]);
  if (!collection) throw new CollectionNotFoundError(collectionId);
  if (!item) throw new Error(`Saved item ${savedItemId} not found`);

  await db.savedItemCollection.upsert({
    where: { savedItemId_collectionId: { savedItemId, collectionId } },
    create: { savedItemId, collectionId },
    update: {},
  });
}

export async function removeItemFromCollection(
  userId: string,
  collectionId: string,
  savedItemId: string,
): Promise<void> {
  const collection = await db.collection.findFirst({ where: { id: collectionId, userId } });
  if (!collection) throw new CollectionNotFoundError(collectionId);

  await db.savedItemCollection.deleteMany({ where: { collectionId, savedItemId } });
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createSavedItem } from '../saved-items';
import {
  addItemToCollection,
  CollectionNotFoundError,
  createCollection,
  deleteCollection,
  getCollectionWithItems,
  listCollections,
  removeItemFromCollection,
} from '../collections';

/**
 * Needs a real database — skips cleanly if none is reachable, same pattern
 * as the other integration tests in this suite.
 */
let dbAvailable = true;
try {
  await db.$queryRaw`SELECT 1`;
} catch {
  dbAvailable = false;
}

describe.skipIf(!dbAvailable)('collections integration', () => {
  let userId: string;
  let otherUserId: string;
  let itemId: string;

  beforeAll(async () => {
    const user = await db.user.upsert({
      where: { email: 'albo-collections-smoke@test.dev' },
      create: { email: 'albo-collections-smoke@test.dev', passwordHash: 'x' },
      update: {},
    });
    userId = user.id;

    const otherUser = await db.user.upsert({
      where: { email: 'albo-collections-smoke-other@test.dev' },
      create: { email: 'albo-collections-smoke-other@test.dev', passwordHash: 'x' },
      update: {},
    });
    otherUserId = otherUser.id;

    const item = await createSavedItem(userId, { type: 'NOTE', title: 'AI agents note', content: 'notes' });
    itemId = item.id;
  });

  afterAll(async () => {
    await db.savedItem.deleteMany({ where: { userId } });
    await db.collection.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await db.$disconnect();
  });

  it('creates a collection and lists it with an item count', async () => {
    const collection = await createCollection(userId, { name: 'AI', emoji: '🤖' });
    expect(collection.name).toBe('AI');

    const collections = await listCollections(userId);
    const found = collections.find((c) => c.id === collection.id);
    expect(found?._count.items).toBe(0);

    await deleteCollection(userId, collection.id);
  });

  it('adds and removes an item, reflected in getCollectionWithItems', async () => {
    const collection = await createCollection(userId, { name: 'Research' });

    await addItemToCollection(userId, collection.id, itemId);
    let withItems = await getCollectionWithItems(userId, collection.id);
    expect(withItems?.items.map((i) => i.savedItem.id)).toEqual([itemId]);

    // adding again is a no-op, not a duplicate/error
    await addItemToCollection(userId, collection.id, itemId);
    withItems = await getCollectionWithItems(userId, collection.id);
    expect(withItems?.items).toHaveLength(1);

    await removeItemFromCollection(userId, collection.id, itemId);
    withItems = await getCollectionWithItems(userId, collection.id);
    expect(withItems?.items).toHaveLength(0);

    await deleteCollection(userId, collection.id);
  });

  it('throws CollectionNotFoundError for another user\'s collection', async () => {
    const collection = await createCollection(userId, { name: 'Private' });

    await expect(addItemToCollection(otherUserId, collection.id, itemId)).rejects.toThrow(
      CollectionNotFoundError,
    );

    await deleteCollection(userId, collection.id);
  });

  it('getCollectionWithItems returns null for a collection scoped to another user', async () => {
    const collection = await createCollection(userId, { name: 'Scoped' });
    const result = await getCollectionWithItems(otherUserId, collection.id);
    expect(result).toBeNull();
    await deleteCollection(userId, collection.id);
  });
});

import { db } from '@/lib/db';

export async function listTags(userId: string) {
  return db.tag.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

/** Finds-or-creates tags by name for a user. Returns tag ids. */
export async function upsertTagsByName(userId: string, names: string[]): Promise<string[]> {
  const unique = Array.from(new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean)));
  if (unique.length === 0) return [];

  const tags = await Promise.all(
    unique.map((name) =>
      db.tag.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name },
        update: {},
      }),
    ),
  );

  return tags.map((t) => t.id);
}

import { db } from '@/lib/db';

export async function listTags(userId: string) {
  return db.tag.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

/** Trims, lowercases, drops empties, and de-duplicates a list of tag names. */
export function normalizeTagNames(names: string[]): string[] {
  return Array.from(new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean)));
}

/** Finds-or-creates tags by name for a user. Returns tag ids. */
export async function upsertTagsByName(userId: string, names: string[]): Promise<string[]> {
  const unique = normalizeTagNames(names);
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

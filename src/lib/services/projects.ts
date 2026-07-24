import { db } from '@/lib/db';

export async function listProjects(userId: string) {
  return db.project.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

export async function getProject(userId: string, id: string) {
  return db.project.findFirst({ where: { id, userId } });
}

export async function createProject(userId: string, name: string, description?: string) {
  return db.project.create({ data: { userId, name: name.trim(), description } });
}

/** Finds-or-creates projects by name for a user. Returns project ids. */
export async function upsertProjectsByName(userId: string, names: string[]): Promise<string[]> {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (unique.length === 0) return [];

  const projects = await Promise.all(
    unique.map((name) =>
      db.project.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name },
        update: {},
      }),
    ),
  );

  return projects.map((p) => p.id);
}

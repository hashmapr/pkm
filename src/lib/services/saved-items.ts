import { Prisma, SavedItemType } from '@prisma/client';
import { db } from '@/lib/db';
import { upsertTagsByName } from './tags';
import { upsertProjectsByName } from './projects';
import { createProcessingJobForItem } from './processing';

const savedItemInclude = {
  tags: { include: { tag: true } },
  projects: { include: { project: true } },
  attachments: true,
  extractedTasks: true,
  extractedEntities: true,
  decisions: true,
  questions: true,
  processingJobs: { orderBy: { createdAt: 'desc' }, take: 1 },
  audioAttachment: true,
} satisfies Prisma.SavedItemInclude;

export type SavedItemWithRelations = Prisma.SavedItemGetPayload<{ include: typeof savedItemInclude }>;

export interface ListSavedItemsFilters {
  type?: SavedItemType;
  tag?: string;
  project?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export async function listSavedItems(userId: string, filters: ListSavedItemsFilters) {
  const where: Prisma.SavedItemWhereInput = {
    userId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.tag ? { tags: { some: { tag: { name: filters.tag.toLowerCase() } } } } : {}),
    ...(filters.project ? { projects: { some: { project: { name: filters.project } } } } : {}),
    ...(filters.q
      ? {
          OR: [
            { title: { contains: filters.q, mode: 'insensitive' } },
            { content: { contains: filters.q, mode: 'insensitive' } },
            { summary: { contains: filters.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.savedItem.findMany({
      where,
      include: savedItemInclude,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.savedItem.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

export async function getSavedItem(userId: string, id: string) {
  return db.savedItem.findFirst({ where: { id, userId }, include: savedItemInclude });
}

export interface SavedItemInput {
  type: SavedItemType;
  title: string;
  source?: string;
  content?: string;
  tags?: string[];
  projects?: string[];
}

export async function createSavedItem(userId: string, input: SavedItemInput) {
  const [tagIds, projectIds] = await Promise.all([
    upsertTagsByName(userId, input.tags ?? []),
    upsertProjectsByName(userId, input.projects ?? []),
  ]);

  const item = await db.savedItem.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      source: input.source,
      content: input.content,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      projects: { create: projectIds.map((projectId) => ({ projectId })) },
    },
    include: savedItemInclude,
  });

  await createProcessingJobForItem(item.id);
  return item;
}

export async function updateSavedItem(userId: string, id: string, input: Partial<SavedItemInput>) {
  const existing = await db.savedItem.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const data: Prisma.SavedItemUpdateInput = {
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
  };

  if (input.tags !== undefined) {
    const tagIds = await upsertTagsByName(userId, input.tags);
    data.tags = {
      deleteMany: {},
      create: tagIds.map((tagId) => ({ tagId })),
    };
  }

  if (input.projects !== undefined) {
    const projectIds = await upsertProjectsByName(userId, input.projects);
    data.projects = {
      deleteMany: {},
      create: projectIds.map((projectId) => ({ projectId })),
    };
  }

  const item = await db.savedItem.update({ where: { id }, data, include: savedItemInclude });
  await createProcessingJobForItem(item.id);
  return { ...item, status: 'PENDING' as const };
}

export async function deleteSavedItem(userId: string, id: string) {
  const existing = await db.savedItem.findFirst({ where: { id, userId } });
  if (!existing) return false;

  await db.savedItem.delete({ where: { id } });
  return true;
}

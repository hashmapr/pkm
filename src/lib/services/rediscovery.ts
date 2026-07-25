import { SavedItemType } from '@prisma/client';
import { db } from '@/lib/db';
import { findRelatedItems } from './search';

/** Below this age, an item is "new," not "forgotten" or "old knowledge" — tunable heuristic. */
const FORGOTTEN_MIN_AGE_DAYS = 14;
/** How many of the most recently saved items to check for connections to older knowledge. */
const RELATED_DISCOVERY_ANCHOR_COUNT = 5;
const RELATED_DISCOVERY_PER_ANCHOR_LIMIT = 3;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface RecentlySavedItem {
  id: string;
  type: SavedItemType;
  title: string;
  summary: string | null;
  createdAt: Date;
}

/** The plainest slice of the rediscovery digest — just what came in most recently. */
export async function getRecentlySaved(userId: string, limit = 10): Promise<RecentlySavedItem[]> {
  return db.savedItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, title: true, summary: true, createdAt: true },
  });
}

export interface ForgottenItem {
  id: string;
  type: SavedItemType;
  title: string;
  summary: string | null;
  createdAt: Date;
  lastViewedAt: Date | null;
}

/**
 * Items old enough to no longer be "new," that either have never been
 * opened or haven't been opened in a while. Ordered by how neglected they
 * are (never-viewed first, then oldest-viewed), not by save date, since the
 * point is surfacing what's been forgotten, not what's oldest.
 */
export async function getForgottenItems(userId: string, limit = 10): Promise<ForgottenItem[]> {
  const threshold = daysAgo(FORGOTTEN_MIN_AGE_DAYS);
  return db.savedItem.findMany({
    where: {
      userId,
      createdAt: { lte: threshold },
      OR: [{ lastViewedAt: null }, { lastViewedAt: { lte: threshold } }],
    },
    orderBy: [{ lastViewedAt: { sort: 'asc', nulls: 'first' } }],
    take: limit,
    select: { id: true, type: true, title: true, summary: true, createdAt: true, lastViewedAt: true },
  });
}

export interface RelatedDiscovery {
  anchor: { id: string; title: string; type: SavedItemType };
  relatedItem: { id: string; title: string; type: SavedItemType; createdAt: Date; similarity: number };
}

/**
 * "You saved this a while ago — it connects to something you just saved."
 * Takes the most recently saved items as anchors and asks Phase 4's existing
 * embedding-similarity search (no new mechanism, no persisted relationship
 * table — see ALBO_INTEGRATION_PLAN.md) which older items they relate to,
 * filtering out anything too new to count as "old knowledge" being
 * resurfaced. Proactive: unlike the item detail page's "Related items"
 * section, this doesn't require the user to open any particular item first.
 */
export async function getRelatedDiscoveries(
  userId: string,
  anchorCount = RELATED_DISCOVERY_ANCHOR_COUNT,
): Promise<RelatedDiscovery[]> {
  const anchors = await getRecentlySaved(userId, anchorCount);
  const threshold = daysAgo(FORGOTTEN_MIN_AGE_DAYS);

  const discoveries: RelatedDiscovery[] = [];
  for (const anchor of anchors) {
    const related = await findRelatedItems(userId, anchor.id, RELATED_DISCOVERY_PER_ANCHOR_LIMIT);
    for (const item of related) {
      if (item.createdAt <= threshold) {
        discoveries.push({
          anchor: { id: anchor.id, title: anchor.title, type: anchor.type },
          relatedItem: { id: item.id, title: item.title, type: item.type, createdAt: item.createdAt, similarity: item.similarity },
        });
      }
    }
  }
  return discoveries;
}

export interface RediscoveryDigest {
  recentlySaved: RecentlySavedItem[];
  forgottenItems: ForgottenItem[];
  relatedDiscoveries: RelatedDiscovery[];
}

/**
 * The query a scheduled weekly digest would run — there's no job scheduler
 * anywhere in this app yet (a known gap since Phase 2), so this is exposed
 * as an on-demand endpoint instead of an actual cron job. Combines all three
 * rediscovery angles into one response.
 */
export async function getRediscoveryDigest(userId: string): Promise<RediscoveryDigest> {
  const [recentlySaved, forgottenItems, relatedDiscoveries] = await Promise.all([
    getRecentlySaved(userId),
    getForgottenItems(userId),
    getRelatedDiscoveries(userId),
  ]);
  return { recentlySaved, forgottenItems, relatedDiscoveries };
}

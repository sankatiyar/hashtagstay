import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { leads, staffProfiles, staffRoles, users } from '@/lib/db/schema';

/**
 * Lead routing (FR-10): geography, language, then load.
 *
 * A resident relocating from Chennai to Pune who wants a Tamil-speaking RM gets
 * one if the Pune desk has one; if not, they get the least-loaded Pune RM
 * rather than waiting. The match level is recorded on the lead's activity so a
 * desk lead can see why a lead went where it did.
 */

export const OPEN_LEAD_STATES = [
  'assigned',
  'contacting',
  'qualified',
  'shortlist_shared',
  'negotiating',
  'booking_initiated',
] as const;

export interface RoutingCandidate {
  userId: string;
  cities: string[];
  languages: string[];
  activeLeads: number;
  maxActiveLeads: number;
  lastAssignedAt: Date | null;
}

export type MatchLevel = 'city_and_language' | 'city' | 'language' | 'any';

export interface RoutingDecision {
  userId: string;
  matchLevel: MatchLevel;
}

const coversCity = (c: RoutingCandidate, city: string | null) =>
  c.cities.length === 0 ||
  (city !== null && c.cities.some((x) => x.toLowerCase() === city.toLowerCase()));

const speaks = (c: RoutingCandidate, language: string) =>
  c.languages.map((l) => l.toLowerCase()).includes(language.toLowerCase());

/**
 * Pure ranking, separated from the query so the policy is unit-testable.
 *
 * Tiers are tried strictest first; within a tier the least-loaded RM wins, and
 * among equals the one assigned longest ago, so new leads spread evenly rather
 * than piling onto whoever sorts first.
 */
export function chooseAssignee(
  candidates: readonly RoutingCandidate[],
  request: { city: string | null; language: string },
): RoutingDecision | null {
  const available = candidates.filter((c) => c.activeLeads < c.maxActiveLeads);
  if (available.length === 0) return null;

  const tiers: [MatchLevel, (c: RoutingCandidate) => boolean][] = [
    [
      'city_and_language',
      (c) => coversCity(c, request.city) && speaks(c, request.language),
    ],
    ['city', (c) => coversCity(c, request.city)],
    ['language', (c) => speaks(c, request.language)],
    ['any', () => true],
  ];

  for (const [level, predicate] of tiers) {
    const pool = available.filter(predicate);
    if (pool.length === 0) continue;
    pool.sort((a, b) => {
      if (a.activeLeads !== b.activeLeads) return a.activeLeads - b.activeLeads;
      const at = a.lastAssignedAt?.getTime() ?? 0;
      const bt = b.lastAssignedAt?.getTime() ?? 0;
      return at - bt;
    });
    return { userId: pool[0].userId, matchLevel: level };
  }
  return null;
}

/** Load candidates: active RMs accepting leads, with their open-lead counts. */
export async function loadCandidates(): Promise<RoutingCandidate[]> {
  const rows = await db
    .select({
      userId: users.id,
      cities: staffProfiles.cities,
      languages: staffProfiles.languages,
      maxActiveLeads: staffProfiles.maxActiveLeads,
      lastAssignedAt: staffProfiles.lastAssignedAt,
      activeLeads: sql<number>`(
        SELECT count(*)::int FROM ${leads}
        WHERE ${leads.assignedToUserId} = ${users.id}
          AND ${leads.state} IN ('assigned','contacting','qualified','shortlist_shared','negotiating','booking_initiated')
      )`,
    })
    .from(users)
    .innerJoin(staffRoles, eq(staffRoles.userId, users.id))
    .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(
      and(
        eq(users.audience, 'staff'),
        isNull(users.disabledAt),
        isNull(users.deletedAt),
        inArray(staffRoles.role, ['rm', 'rm_lead']),
        isNull(staffRoles.revokedAt),
        eq(staffProfiles.isAcceptingLeads, true),
      ),
    );

  // A user holding both rm and rm_lead appears twice from the join.
  const unique = new Map<string, RoutingCandidate>();
  for (const row of rows) unique.set(row.userId, row);
  return [...unique.values()];
}

export async function pickAssignee(request: {
  city: string | null;
  language: string;
}): Promise<RoutingDecision | null> {
  return chooseAssignee(await loadCandidates(), request);
}

export async function markAssigned(userId: string): Promise<void> {
  await db
    .update(staffProfiles)
    .set({ lastAssignedAt: new Date(), updatedAt: new Date() })
    .where(eq(staffProfiles.userId, userId));
}

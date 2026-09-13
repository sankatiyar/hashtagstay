import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

import { type AuthenticatedUser, createSession, getCurrentUser } from './session';

/**
 * Resident identity. Residents have no password: a verified phone is the
 * account. The same person may already exist as a lead contact, so the account
 * is found or created by phone rather than by a separate sign-up step.
 */

export async function findOrCreateResident(params: {
  phone: string;
  name?: string | null;
  email?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: users.id, fullName: users.fullName, audience: users.audience })
    .from(users)
    .where(and(eq(users.phone, params.phone), isNull(users.deletedAt)))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        phoneVerifiedAt: sql`coalesce(${users.phoneVerifiedAt}, now())`,
        fullName: existing.fullName ?? params.name ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [created] = await db
    .insert(users)
    .values({
      audience: 'resident',
      phone: params.phone,
      phoneVerifiedAt: new Date(),
      fullName: params.name ?? null,
      email: params.email ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  if (created) return { id: created.id, created: true };

  // Lost a race with a concurrent request for the same phone.
  const [raced] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, params.phone))
    .limit(1);
  return { id: raced.id, created: false };
}

export async function signInResident(params: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await createSession({
    userId: params.userId,
    audience: 'resident',
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    mfaSatisfied: true,
  });
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, params.userId));
}

/**
 * The signed-in person, if they can act as a resident. A staff member or host
 * browsing the public site with their own phone on file is not treated as a
 * resident account.
 */
export async function getCurrentResident(): Promise<AuthenticatedUser | null> {
  const user = await getCurrentUser();
  return user && user.audience === 'resident' ? user : null;
}

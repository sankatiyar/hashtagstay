import { eq } from 'drizzle-orm';

import { type AuditActor, audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { staffProfiles, users } from '@/lib/db/schema';
import { normalizeIndianMobile } from '@/lib/phone';

/**
 * A staff member's own desk settings: the phone click-to-call rings, which
 * cities and languages they cover, and whether they are taking new leads.
 */

export async function getStaffProfile(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, userId));
  const [profile] = await db
    .select()
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, userId));
  return { user, profile: profile ?? null };
}

export async function updateStaffProfile(
  userId: string,
  input: {
    phone: string | null;
    cities: string[];
    languages: string[];
    maxActiveLeads: number;
    isAcceptingLeads: boolean;
  },
  actor: AuditActor,
): Promise<void> {
  const phone = input.phone ? normalizeIndianMobile(input.phone) : null;
  if (input.phone && !phone)
    throw new Error('Enter a valid 10-digit Indian mobile number.');
  if (
    !Number.isInteger(input.maxActiveLeads) ||
    input.maxActiveLeads < 1 ||
    input.maxActiveLeads > 500
  ) {
    throw new Error('Maximum open leads must be between 1 and 500.');
  }

  await db
    .update(users)
    .set({ phone, updatedAt: new Date() })
    .where(eq(users.id, userId));
  const values = {
    cities: input.cities.map((c) => c.trim()).filter(Boolean),
    languages: input.languages.map((l) => l.trim().toLowerCase()).filter(Boolean),
    maxActiveLeads: input.maxActiveLeads,
    isAcceptingLeads: input.isAcceptingLeads,
    updatedAt: new Date(),
  };
  await db
    .insert(staffProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: staffProfiles.userId, set: values });

  await audit({
    actor,
    action: 'update',
    entityType: 'staff_profiles',
    entityId: userId,
    after: { ...values, phoneSet: Boolean(phone) },
  });
}

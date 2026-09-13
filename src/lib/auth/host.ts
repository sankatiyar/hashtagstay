import { and, asc, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { organizations, orgMembers, users } from '@/lib/db/schema';
import { slugify, uniqueSlug } from '@/lib/slug';

import type { OrgRole, Permission } from './permissions';
import { orgCan } from './permissions';
import { checkPasswordStrength, hashPassword } from './password';
import { type AuthenticatedUser, getCurrentUser } from './session';

/**
 * Host and operator accounts (PRD Journey B; FR-15).
 *
 * A host signs up themselves, which creates their user, their organization and
 * an owner membership in one step. Everything a host does afterwards is scoped
 * to the organizations they belong to — a host can never see another operator's
 * inventory, bookings or statements.
 */

export class HostAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostAccountError';
  }
}

export interface HostContext {
  user: AuthenticatedUser;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  memberships: { organizationId: string; organizationName: string; role: OrgRole }[];
}

export async function signUpHost(input: {
  fullName: string;
  email: string;
  phone: string | null;
  password: string;
  organizationName: string;
  legalName?: string | null;
  gstin?: string | null;
}): Promise<{ userId: string; organizationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new HostAccountError('Enter a valid email address.');
  const strength = checkPasswordStrength(input.password);
  if (!strength.ok) throw new HostAccountError(strength.problems.join(' '));
  if (input.organizationName.trim().length < 2)
    throw new HostAccountError('Enter your business or property name.');
  if (
    input.gstin &&
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
      input.gstin.trim().toUpperCase(),
    )
  ) {
    throw new HostAccountError(
      'That GSTIN does not look valid. Leave it blank if you are not GST registered.',
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing)
    throw new HostAccountError(
      'An account with that email already exists. Sign in instead.',
    );

  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.organizationName) || 'operator';
  const taken = await db.select({ slug: organizations.slug }).from(organizations);
  const slug = uniqueSlug(
    baseSlug,
    taken.map((t) => t.slug),
  );

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        audience: 'host',
        email,
        passwordHash,
        fullName: input.fullName.trim(),
        phone: input.phone,
      })
      .returning({ id: users.id });

    const [org] = await tx
      .insert(organizations)
      .values({
        name: input.organizationName.trim(),
        slug,
        legalName: input.legalName?.trim() || null,
        gstin: input.gstin?.trim().toUpperCase() || null,
        contactEmail: email,
        contactPhone: input.phone,
      })
      .returning({ id: organizations.id });

    await tx
      .insert(orgMembers)
      .values({ organizationId: org.id, userId: user.id, role: 'owner' });
    return { userId: user.id, organizationId: org.id };
  });
}

export async function hostMemberships(userId: string) {
  return db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.organizationId))
    .where(and(eq(orgMembers.userId, userId), isNull(organizations.deletedAt)))
    .orderBy(asc(organizations.name));
}

/** Current host with their active organization, or redirect to host sign-in. */
export async function requireHost(
  returnTo?: string,
  organizationId?: string,
): Promise<HostContext> {
  const user = await getCurrentUser();
  if (!user || user.audience !== 'host') {
    redirect(
      returnTo ? `/host/login?next=${encodeURIComponent(returnTo)}` : '/host/login',
    );
  }
  const memberships = await hostMemberships(user.id);
  if (memberships.length === 0) redirect('/host/login?error=no_organization');

  const active =
    memberships.find((m) => m.organizationId === organizationId) ?? memberships[0];
  return {
    user,
    organizationId: active.organizationId,
    organizationName: active.organizationName,
    role: active.role,
    memberships,
  };
}

export function assertHostCan(context: HostContext, permission: Permission): void {
  if (!orgCan(context.role, permission)) {
    throw new HostAccountError('Your role in this organization does not allow that.');
  }
}

/** For server actions: the host context without redirecting. */
export async function hostForAction(): Promise<HostContext> {
  const user = await getCurrentUser();
  if (!user || user.audience !== 'host')
    throw new HostAccountError('Please sign in again.');
  const memberships = await hostMemberships(user.id);
  if (memberships.length === 0)
    throw new HostAccountError('No organization is linked to this account.');
  const active = memberships[0];
  return {
    user,
    organizationId: active.organizationId,
    organizationName: active.organizationName,
    role: active.role,
    memberships,
  };
}

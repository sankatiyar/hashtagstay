import { redirect } from 'next/navigation';

import { audit } from '@/lib/audit';

import { PermissionDeniedError, type Permission, can } from './permissions';
import { type AuthenticatedUser, getCurrentUser } from './session';

/**
 * Route and action guards.
 *
 * Authorization is enforced here — in the data-access path — not in `proxy.ts`.
 * Next.js is explicit that proxy (formerly middleware) is for optimistic checks
 * only and must not be a session or authorization solution: it runs before the
 * request reaches the handler and is easy to bypass in ways a server-side check
 * is not. The proxy redirects unauthenticated visitors for a nicer experience;
 * these functions are what actually protect data.
 */

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in.');
    this.name = 'UnauthenticatedError';
  }
}

/** Current staff user, or redirect to the sign-in page. */
export async function requireStaff(returnTo?: string): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user || user.audience !== 'staff') {
    const target = returnTo
      ? `/admin/login?next=${encodeURIComponent(returnTo)}`
      : '/admin/login';
    redirect(target);
  }

  return user;
}

/**
 * Current staff user holding `permission`, or redirect / throw.
 *
 * A denied attempt is audited. "Someone tried to reach the refund screen"
 * is exactly the signal you want retained, and §9 asks for the trail.
 */
export async function requirePermission(
  permission: Permission,
  options: { returnTo?: string; throwInsteadOfRedirect?: boolean } = {},
): Promise<AuthenticatedUser> {
  const user = await requireStaff(options.returnTo);

  if (!can(user.roles, permission)) {
    await audit({
      actor: { id: user.id, label: user.email ?? user.fullName },
      action: 'permission_denied',
      entityType: 'permission',
      after: { permission, roles: user.roles },
    });

    if (options.throwInsteadOfRedirect) {
      throw new PermissionDeniedError(permission, user.roles);
    }
    redirect('/admin/denied');
  }

  return user;
}

/**
 * Assert a permission inside a Server Action, throwing rather than redirecting.
 * A redirect from an action the user was never allowed to invoke reads as a
 * broken page; an error is honest.
 */
export async function requirePermissionForAction(
  permission: Permission,
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user || user.audience !== 'staff') {
    throw new UnauthenticatedError();
  }
  if (!can(user.roles, permission)) {
    await audit({
      actor: { id: user.id, label: user.email ?? user.fullName },
      action: 'permission_denied',
      entityType: 'permission',
      after: { permission, roles: user.roles },
    });
    throw new PermissionDeniedError(permission, user.roles);
  }

  return user;
}

/** Audit-friendly actor descriptor for a signed-in user. */
export const actorFor = (user: AuthenticatedUser) => ({
  id: user.id,
  label: user.email ?? user.fullName ?? user.id,
});

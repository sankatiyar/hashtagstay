'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { audit } from '@/lib/audit';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, destroyCurrentSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export interface LoginState {
  error?: string;
}

/**
 * Staff sign-in.
 *
 * Failure messages are deliberately identical for "no such account", "wrong
 * password" and "not a staff account". Distinguishing them turns this form into
 * an account-enumeration oracle, and `verifyPassword` does equivalent bcrypt
 * work on the no-user path so the timing does not leak the same information.
 */
export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/admin');

  if (!email || !password) {
    return { error: 'Enter your email and password.' };
  }

  const [user] = await db
    .select({
      id: users.id,
      audience: users.audience,
      email: users.email,
      fullName: users.fullName,
      passwordHash: users.passwordHash,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);

  const allowed = passwordOk && user && user.audience === 'staff' && !user.disabledAt;

  if (!allowed) {
    await audit({
      // No actor id on a failed attempt: the email is a claim, not an identity.
      actor: { id: null, label: email },
      action: 'login_failed',
      entityType: 'users',
      entityId: user?.id ?? null,
      after: {
        email,
        reason: !user
          ? 'no_such_user'
          : !passwordOk
            ? 'bad_password'
            : user.audience !== 'staff'
              ? 'not_staff'
              : 'disabled',
      },
    });
    return { error: 'Those credentials are not valid.' };
  }

  const headerList = await headers();
  await createSession({
    userId: user.id,
    audience: 'staff',
    ipAddress:
      headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headerList.get('x-real-ip'),
    userAgent: headerList.get('user-agent'),
    // TOTP is not enrolled yet (see docs/vendors.md and the M6 hardening step).
    // Recording false rather than true keeps the flag honest, so when the TOTP
    // challenge lands every existing session correctly reads as unsatisfied.
    mfaSatisfied: false,
  });

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  await audit({
    actor: { id: user.id, label: user.email ?? user.fullName },
    action: 'login',
    entityType: 'users',
    entityId: user.id,
  });

  // Only allow relative redirects: an absolute URL here would make this an open
  // redirect that a phishing link could point anywhere.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/admin');
}

export async function signOut(): Promise<void> {
  await destroyCurrentSession();
  redirect('/admin/login');
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { db } from '@/lib/db';
import { sessions, staffRoles, users } from '@/lib/db/schema';

import type { StaffRole } from './permissions';

/**
 * Server-side sessions.
 *
 * Deliberately not a stateless JWT. Staff accounts can read resident PII in
 * bulk, so disabling an account or honouring a DPDP erasure request has to take
 * effect immediately rather than whenever a token happens to expire. A row we
 * can revoke is the only way to get that.
 *
 * Only the SHA-256 of the token is stored. A leaked database dump therefore
 * does not hand over usable sessions.
 */

export const SESSION_COOKIE = 'hs_session';

/**
 * Staff sessions are short by intent. Twelve hours covers a working day without
 * leaving an authenticated console open overnight on an unattended machine.
 */
const STAFF_SESSION_HOURS = 12;
const RESIDENT_SESSION_DAYS = 30;

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export interface AuthenticatedUser {
  readonly id: string;
  readonly audience: 'resident' | 'host' | 'staff';
  readonly email: string | null;
  readonly phone: string | null;
  readonly fullName: string | null;
  readonly roles: readonly StaffRole[];
  readonly sessionId: string;
  readonly mfaSatisfied: boolean;
}

export interface CreateSessionInput {
  userId: string;
  audience: 'resident' | 'host' | 'staff';
  ipAddress?: string | null;
  userAgent?: string | null;
  /** True once a TOTP challenge has been satisfied for this session. */
  mfaSatisfied?: boolean;
}

/**
 * Issue a session and set its cookie. Returns the raw token only so callers can
 * log it in tests; production code should ignore it — the cookie is the
 * transport.
 */
export async function createSession(input: CreateSessionInput): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date();
  if (input.audience === 'staff') {
    expiresAt.setHours(expiresAt.getHours() + STAFF_SESSION_HOURS);
  } else {
    expiresAt.setDate(expiresAt.getDate() + RESIDENT_SESSION_DAYS);
  }

  await db.insert(sessions).values({
    userId: input.userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    mfaSatisfied: input.mfaSatisfied ?? false,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure is conditional only so local http development works; anything
    // deployed must be https.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return token;
}

/**
 * Resolve the current user from the session cookie, or null.
 *
 * Checks the account is still usable on every request — not just at login —
 * which is the whole point of server-side sessions: `disabledAt` and
 * `anonymisedAt` take effect on the next request.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      mfaSatisfied: sessions.mfaSatisfied,
      userId: users.id,
      audience: users.audience,
      email: users.email,
      phone: users.phone,
      fullName: users.fullName,
      disabledAt: users.disabledAt,
      anonymisedAt: users.anonymisedAt,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.disabledAt || row.anonymisedAt || row.deletedAt) return null;

  let roles: StaffRole[] = [];
  if (row.audience === 'staff') {
    const roleRows = await db
      .select({ role: staffRoles.role })
      .from(staffRoles)
      .where(and(eq(staffRoles.userId, row.userId), isNull(staffRoles.revokedAt)));
    roles = roleRows.map((r) => r.role);
  }

  return {
    id: row.userId,
    audience: row.audience,
    email: row.email,
    phone: row.phone,
    fullName: row.fullName,
    roles,
    sessionId: row.sessionId,
    mfaSatisfied: row.mfaSatisfied,
  };
}

/** Revoke the current session and clear its cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session for a user — account disabled, password changed, erasure. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Delete expired and long-revoked sessions. Sessions carry IP and user agent,
 * so keeping them forever is data retention we cannot justify under the DPDP
 * purpose-limitation principle.
 */
export async function pruneSessions(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const deleted = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, new Date()), lt(sessions.revokedAt, cutoff)))
    .returning({ id: sessions.id });
  return deleted.length;
}

/**
 * Constant-time comparison for any secret we compare in application code
 * (OTP hashes, shortlist tokens). Not used for passwords — bcrypt handles its
 * own comparison — but an early-exit `===` on a token hash is a timing oracle.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

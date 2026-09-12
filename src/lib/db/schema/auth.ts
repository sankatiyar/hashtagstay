import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, primaryId, timestamps, tsColumn } from './columns';
import { staffRoleEnum, userAudienceEnum } from './enums';

/**
 * One user table, three audiences (resident / host / staff). They share a table
 * because a single person genuinely can be more than one — a host's manager who
 * also enquires as a resident — and because every audit-log actor should
 * resolve to exactly one identity.
 *
 * What differs per audience is the *credential*, not the record:
 *   - resident: phone + OTP (no password at all)
 *   - host:     email + password
 *   - staff:    email + password + mandatory TOTP
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    audience: userAudienceEnum().notNull(),

    /** E.164, e.g. +919876543210. Primary identifier for residents. */
    phone: text(),
    phoneVerifiedAt: tsColumn(),

    email: text(),
    emailVerifiedAt: tsColumn(),

    /** bcrypt hash. Null for residents, who never set a password. */
    passwordHash: text(),

    fullName: text(),
    /** Preferred language, used for RM routing (FR-10) and message templates. */
    preferredLocale: text().notNull().default('en-IN'),

    /**
     * Collected only where it matters. Under-18 enquirers need a guardian's
     * consent under DPDP §9 — a real case for student housing, where a
     * meaningful share of applicants are 17 (build plan concern #5).
     */
    dateOfBirth: tsColumn(),

    lastLoginAt: tsColumn(),
    /** Set once a DPDP erasure request has been executed against this user. */
    anonymisedAt: tsColumn(),
    disabledAt: tsColumn(),

    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    // Partial unique indexes: a resident identified by phone and a host
    // identified by email coexist without either column being globally NOT
    // NULL. Nulls are excluded so absent values never collide with each other.
    uniqueIndex('users_phone_key')
      .on(t.phone)
      .where(sql`${t.phone} IS NOT NULL`),
    uniqueIndex('users_email_key')
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL`),
    index('users_audience_idx').on(t.audience),
  ],
);

/**
 * Staff role assignments. A separate table rather than a column on `users`
 * because staff legitimately hold more than one role (an RM lead who also
 * verifies), and because granting or revoking a role is itself an event we want
 * in the audit trail with its own timestamp and grantor.
 */
export const staffRoles = pgTable(
  'staff_roles',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: staffRoleEnum().notNull(),
    grantedBy: uuid().references(() => users.id),
    grantedAt: tsColumn().notNull().defaultNow(),
    revokedAt: tsColumn(),
  },
  (t) => [
    uniqueIndex('staff_roles_user_role_key').on(t.userId, t.role),
    index('staff_roles_user_idx').on(t.userId),
  ],
);

/**
 * TOTP enrolment for staff. Mandatory for every internal user: these accounts
 * read resident PII in bulk and move money-adjacent state, so a leaked password
 * alone must not be sufficient.
 */
export const staffMfa = pgTable('staff_mfa', {
  id: primaryId(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** TOTP shared secret, encrypted by the application before insert. */
  totpSecretEncrypted: text().notNull(),
  confirmedAt: tsColumn(),
  /** Single-use recovery codes, stored hashed. */
  recoveryCodeHashes: text().array(),
  ...timestamps(),
});

/**
 * Sessions. Server-side rather than stateless-JWT-only, so that disabling a
 * staff account or honouring a DPDP erasure request takes effect immediately
 * instead of whenever a token happens to expire.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the session token; the raw token only ever lives in a cookie. */
    tokenHash: text().notNull().unique(),
    expiresAt: tsColumn().notNull(),
    /** For the audit trail and for "sign out my other devices". */
    ipAddress: text(),
    userAgent: text(),
    /** True once the TOTP step has been satisfied for this session. */
    mfaSatisfied: boolean().notNull().default(false),
    revokedAt: tsColumn(),
    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/**
 * One-time codes for phone/email verification and resident login.
 *
 * Stored hashed and throttled via `attemptCount`, because an unthrottled
 * 6-digit OTP is trivially brute-forced. `purpose` scopes a code so one issued
 * for login cannot be replayed to verify a phone number.
 */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: primaryId(),
    /** Phone (E.164) or email address the code was sent to. */
    destination: text().notNull(),
    channel: text().notNull(),
    purpose: text().notNull(),
    codeHash: text().notNull(),
    expiresAt: tsColumn().notNull(),
    consumedAt: tsColumn(),
    attemptCount: integer().notNull().default(0),
    createdAt: tsColumn().notNull().defaultNow(),
  },
  (t) => [
    index('otp_codes_destination_idx').on(t.destination, t.purpose),
    index('otp_codes_expires_idx').on(t.expiresAt),
  ],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  staffRoles: many(staffRoles),
  sessions: many(sessions),
  mfa: one(staffMfa),
}));

export const staffRolesRelations = relations(staffRoles, ({ one }) => ({
  user: one(users, { fields: [staffRoles.userId], references: [users.id] }),
}));

export const staffMfaRelations = relations(staffMfa, ({ one }) => ({
  user: one(users, { fields: [staffMfa.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

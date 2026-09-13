import { createHmac, timingSafeEqual } from 'node:crypto';

import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { otpCodes } from '@/lib/db/schema';
import { serverEnv } from '@/lib/env';
import { newOtpCode } from '@/lib/ids';
import { sendNotification } from '@/lib/integrations/messaging';
import { requireIndianMobile } from '@/lib/phone';

/**
 * Phone one-time passcodes.
 *
 * OTP is what keeps bot and competitor traffic off the sales desk — RM minutes
 * are the most expensive resource in the business — and it is the resident's
 * login. Codes are stored as a keyed hash, expire in ten minutes, allow five
 * attempts, and are rate limited per number.
 *
 * In development, where SMS is not configured, the code is returned to the
 * caller so the page can show it. That path is compiled out of production by
 * the NODE_ENV check.
 */

export type OtpPurpose = 'enquiry' | 'login';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_WINDOW = 5;
const WINDOW_MINUTES = 30;

function hashCode(destination: string, purpose: OtpPurpose, code: string): string {
  return createHmac('sha256', serverEnv().AUTH_SECRET)
    .update(`${purpose}:${destination}:${code}`)
    .digest('hex');
}

export type RequestOtpResult =
  | { ok: true; destination: string; devCode?: string }
  | {
      ok: false;
      reason: 'invalid_phone' | 'cooldown' | 'rate_limited';
      retryAfterSeconds?: number;
      message: string;
    };

export async function requestOtp(params: {
  phone: string;
  purpose: OtpPurpose;
}): Promise<RequestOtpResult> {
  let destination: string;
  try {
    destination = requireIndianMobile(params.phone);
  } catch {
    return {
      ok: false,
      reason: 'invalid_phone',
      message: 'Enter a valid 10-digit Indian mobile number.',
    };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60_000);

  const recent = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.destination, destination),
        eq(otpCodes.purpose, params.purpose),
        gt(otpCodes.createdAt, windowStart),
      ),
    )
    .orderBy(desc(otpCodes.createdAt));

  if (recent.length > 0) {
    const secondsSinceLast = (now.getTime() - recent[0].createdAt.getTime()) / 1000;
    if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast);
      return {
        ok: false,
        reason: 'cooldown',
        retryAfterSeconds: wait,
        message: `Please wait ${wait} seconds before requesting another code.`,
      };
    }
  }
  if (recent.length >= MAX_CODES_PER_WINDOW) {
    return {
      ok: false,
      reason: 'rate_limited',
      retryAfterSeconds: WINDOW_MINUTES * 60,
      message: 'Too many codes requested for this number. Try again in 30 minutes.',
    };
  }

  const code = newOtpCode();
  await db.insert(otpCodes).values({
    destination,
    channel: 'sms',
    purpose: params.purpose,
    codeHash: hashCode(destination, params.purpose, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
  });

  await sendNotification({
    templateKey: 'otp.verify',
    channel: 'sms',
    to: destination,
    variables: { code },
  });

  return serverEnv().NODE_ENV === 'production'
    ? { ok: true, destination }
    : { ok: true, destination, devCode: code };
}

export type VerifyOtpResult =
  | { ok: true; destination: string }
  | {
      ok: false;
      reason: 'invalid_phone' | 'no_code' | 'expired' | 'locked' | 'mismatch';
      message: string;
    };

export async function verifyOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<VerifyOtpResult> {
  let destination: string;
  try {
    destination = requireIndianMobile(params.phone);
  } catch {
    return {
      ok: false,
      reason: 'invalid_phone',
      message: 'Enter a valid mobile number.',
    };
  }

  const code = params.code.replace(/\D/g, '');
  const now = new Date();

  const [latest] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.destination, destination),
        eq(otpCodes.purpose, params.purpose),
        isNull(otpCodes.consumedAt),
      ),
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!latest) {
    return { ok: false, reason: 'no_code', message: 'Request a code first.' };
  }
  if (latest.expiresAt.getTime() < now.getTime()) {
    return {
      ok: false,
      reason: 'expired',
      message: 'That code has expired. Request a new one.',
    };
  }
  if (latest.attemptCount >= MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: 'locked',
      message: 'Too many incorrect attempts. Request a new code.',
    };
  }

  const expected = Buffer.from(latest.codeHash);
  const actual = Buffer.from(hashCode(destination, params.purpose, code));
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await db
      .update(otpCodes)
      .set({ attemptCount: sql`${otpCodes.attemptCount} + 1` })
      .where(eq(otpCodes.id, latest.id));
    const left = MAX_ATTEMPTS - latest.attemptCount - 1;
    return {
      ok: false,
      reason: 'mismatch',
      message:
        left > 0
          ? `That code is not right. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
          : 'Too many incorrect attempts. Request a new code.',
    };
  }

  // Conditional update so two concurrent submissions cannot both consume it.
  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: now })
    .where(and(eq(otpCodes.id, latest.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });

  if (consumed.length === 0) {
    return { ok: false, reason: 'no_code', message: 'That code was already used.' };
  }
  return { ok: true, destination };
}

import { and, eq, lt } from 'drizzle-orm';

import { pruneSessions } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { payments } from '@/lib/db/schema';

import { markSlaBreaches } from './leads';
import { generateStatements, previousMonth } from './statements';
import { expireLapsedVerifications } from './verification';

/**
 * Scheduled work.
 *
 * One entry point, safe to run as often as every minute, because every step is
 * idempotent. It is invoked by `/api/cron/run` (with CRON_SECRET) from a
 * platform scheduler in production, and by `npm run jobs` in development.
 */

export interface JobSummary {
  ranAt: string;
  slaBreaches: number;
  verificationsExpired: number;
  paymentLinksExpired: number;
  statementsGenerated: number;
  sessionsPruned: number;
  errors: string[];
}

const PAYMENT_LINK_TTL_HOURS = 72;

export async function runScheduledJobs(now = new Date()): Promise<JobSummary> {
  const summary: JobSummary = {
    ranAt: now.toISOString(),
    slaBreaches: 0,
    verificationsExpired: 0,
    paymentLinksExpired: 0,
    statementsGenerated: 0,
    sessionsPruned: 0,
    errors: [],
  };

  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      summary.errors.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  await step('sla', async () => {
    summary.slaBreaches = (await markSlaBreaches(now)).length;
  });

  await step('verification-expiry', async () => {
    summary.verificationsExpired = (await expireLapsedVerifications()).length;
  });

  await step('payment-link-expiry', async () => {
    const cutoff = new Date(now.getTime() - PAYMENT_LINK_TTL_HOURS * 3_600_000);
    const expired = await db
      .update(payments)
      .set({
        state: 'failed',
        failedAt: now,
        failureReason: 'Payment link expired',
        updatedAt: now,
      })
      .where(and(eq(payments.state, 'pending'), lt(payments.updatedAt, cutoff)))
      .returning({ id: payments.id });
    summary.paymentLinksExpired = expired.length;
  });

  await step('statements', async () => {
    const { start, end } = previousMonth(now);
    const results = await generateStatements({
      periodStart: start,
      periodEnd: end,
      issue: false,
    });
    summary.statementsGenerated = results.length;
  });

  await step('sessions', async () => {
    summary.sessionsPruned = await pruneSessions();
  });

  return summary;
}

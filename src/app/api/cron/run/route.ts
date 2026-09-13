import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { runScheduledJobs } from '@/lib/services/jobs';

/**
 * Scheduled jobs endpoint: SLA breaches, verification expiry, payment-link
 * expiry, monthly statements, session pruning.
 *
 * Production requires `Authorization: Bearer $CRON_SECRET`. Development allows
 * calls without a secret when none is configured, so `npm run jobs` works.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function handle(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const summary = await runScheduledJobs();
  return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
}

export const GET = handle;
export const POST = handle;

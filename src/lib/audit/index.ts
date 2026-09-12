import { randomUUID } from 'node:crypto';

import { headers } from 'next/headers';

import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import type { Permission } from '@/lib/auth/permissions';
import { ALWAYS_AUDITED } from '@/lib/auth/permissions';

/**
 * Audit trail (PRD §9: "full audit trail of lead status changes, bookings, fee
 * calculations, and payouts").
 *
 * Design points that matter more than they look:
 *
 *  - **Only changed fields are recorded**, not whole rows. A diff stays readable
 *    and does not duplicate resident PII into a second table we would then also
 *    have to honour erasure requests against.
 *  - **`actorLabel` is denormalised.** When a user is anonymised for a DPDP
 *    erasure request, `actorUserId` still resolves but the name is gone. Storing
 *    a label at write time keeps the trail legible without retaining the
 *    personal record.
 *  - **Failures are swallowed, loudly.** An audit write must never be the reason
 *    a booking fails to save. It is logged to stderr so the gap is visible.
 */

export interface AuditActor {
  readonly id: string | null;
  readonly label?: string | null;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'state_transition'
  | 'login'
  | 'login_failed'
  | 'permission_denied'
  | 'export'
  | 'impersonate';

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  /** Table name of the affected record, e.g. "properties". */
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Groups every write made in one request. */
  requestId?: string;
}

/**
 * Reduce a before/after pair to only the fields that actually changed.
 *
 * Without this, an "update" entry is mostly noise and the one field someone
 * cares about is buried. Values are compared by JSON equality, which is
 * adequate for the scalar and jsonb columns this schema uses.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  if (!before) return { before: {}, after: (after ?? {}) as Record<string, unknown> };
  if (!after) return { before: before as Record<string, unknown>, after: {} };

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    // `updatedAt` changes on every write and tells nobody anything.
    if (key === 'updatedAt') continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changedBefore[key] = a;
      changedAfter[key] = b;
    }
  }
  return { before: changedBefore, after: changedAfter };
}

/** Best-effort request metadata. Returns nulls outside a request context. */
async function requestMetadata(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    // x-forwarded-for is a list; the client is the first entry.
    const forwarded = h.get('x-forwarded-for');
    return {
      ipAddress: forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
      userAgent: h.get('user-agent'),
    };
  } catch {
    // Called from a script, a job, or a test — no request to read.
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Write an audit entry. Never throws.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const { ipAddress, userAgent } = await requestMetadata();
    await db.insert(auditLog).values({
      actorUserId: entry.actor.id,
      actorLabel: entry.actor.label ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ipAddress,
      userAgent,
      requestId: entry.requestId ?? randomUUID(),
    });
  } catch (error) {
    // A failed audit write must not fail the business operation, but it must
    // not be silent either — a gap in the trail is itself a finding.
    console.error('[audit] failed to record entry', {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/** Convenience wrapper for a state-machine transition. */
export async function auditTransition(params: {
  actor: AuditActor;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
  reason?: string | null;
  requestId?: string;
}): Promise<void> {
  await audit({
    actor: params.actor,
    action: 'state_transition',
    entityType: params.entityType,
    entityId: params.entityId,
    before: { state: params.from },
    after: { state: params.to, reason: params.reason ?? null },
    requestId: params.requestId,
  });
}

/**
 * Whether exercising a permission obliges an audit entry. Kept next to the
 * permission model rather than remembered at call sites.
 */
export const requiresAudit = (permission: Permission): boolean =>
  ALWAYS_AUDITED.includes(permission);

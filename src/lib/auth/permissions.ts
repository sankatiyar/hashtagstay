import { orgMemberRoleEnum, staffRoleEnum } from '@/lib/db/schema/enums';

/**
 * Role-based access control (PRD §9: "role-based access control for RM/admin
 * users").
 *
 * Permissions are declared as data and derived from roles, rather than checked
 * as `if (user.role === 'admin')` at call sites. Two reasons that matter here:
 *
 *  1. Staff accounts read resident PII in bulk and move money-adjacent state.
 *     "Who could have done this?" has to be answerable from one table, not by
 *     grepping for role checks.
 *  2. The `verifier` / `ops` split is a real control, not bureaucracy — see
 *     `SEPARATION_OF_DUTIES` below.
 */

export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type OrgRole = (typeof orgMemberRoleEnum.enumValues)[number];

/**
 * Permissions are `resource:action`. Keep them coarse enough to reason about
 * and fine enough that a role never implies more than its job needs.
 */
export const PERMISSIONS = [
  // --- Supply / inventory ------------------------------------------------
  'organization:create',
  'organization:edit',
  'organization:suspend',
  /**
   * Read inventory. Separate from `property:edit` because several roles need to
   * look without touching: a verifier must see a property to certify it but
   * must not be able to change it, and an RM must see inventory to build a
   * shortlist. Gating read pages on `property:edit` locked both of them out.
   */
  'property:view',
  'property:create',
  'property:edit',
  'property:submit_for_verification',
  'property:publish',
  'property:suspend',
  'property:archive',
  'availability:edit',
  'media:upload',
  'media:moderate',

  // --- Verification -------------------------------------------------------
  'verification:request',
  'verification:review',
  /** Granting a trust badge. Deliberately narrow. */
  'verification:approve',

  // --- Demand / desk ------------------------------------------------------
  /** See every lead on the desk, not just your own queue. */
  'lead:view_all',
  'lead:view_assigned',
  'lead:edit',
  'lead:assign',
  'lead:reassign',
  'lead:disqualify',
  'call:place',
  'call:listen_recording',
  'shortlist:create',
  'shortlist:share',

  // --- Transaction --------------------------------------------------------
  'booking:create',
  'booking:request_host_confirmation',
  'booking:cancel',
  'payment:create_link',
  'payment:view',
  'payment:refund',
  'invoice:issue',
  'statement:generate',
  'fee_rule:view',
  'fee_rule:edit',

  // --- Support / trust and safety ----------------------------------------
  'ticket:view',
  'ticket:respond',
  'ticket:handle_safety_incident',
  /** Publish or reject resident reviews (FR-27). */
  'review:moderate',
  /** Enter marketing spend so cost-per-lead can be computed. */
  'marketing_spend:edit',

  // --- Platform -----------------------------------------------------------
  'user:manage',
  'role:grant',
  'report:view',
  /** Pulling PII out of the system. Always audited; never a default. */
  'export:pii',
  'audit:view',
  'dsr:handle',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const RM: readonly Permission[] = [
  'property:view',
  'lead:view_assigned',
  'lead:edit',
  'lead:disqualify',
  'call:place',
  'shortlist:create',
  'shortlist:share',
  'booking:create',
  'booking:request_host_confirmation',
  'payment:create_link',
  'payment:view',
  'availability:edit', // An RM confirms a bed on a call; that is a real source.
  'ticket:view',
  'ticket:respond',
  'fee_rule:view',
];

const RM_LEAD: readonly Permission[] = [
  ...RM,
  'lead:view_all',
  'lead:assign',
  'lead:reassign',
  'call:listen_recording', // Quality assurance on their own desk.
  'booking:cancel',
  'report:view',
];

const OPS: readonly Permission[] = [
  'property:view',
  'organization:create',
  'organization:edit',
  'property:create',
  'property:edit',
  'property:submit_for_verification',
  'property:archive',
  'availability:edit',
  'media:upload',
  'media:moderate',
  'verification:request',
  'lead:view_all',
  'ticket:view',
  'ticket:respond',
  'ticket:handle_safety_incident',
  'review:moderate',
  'report:view',
];

/**
 * Note what `verifier` does NOT have: `property:create` or `property:edit`.
 * The role exists to certify inventory it did not enter.
 */
const VERIFIER: readonly Permission[] = [
  'property:view',
  'verification:review',
  'verification:approve',
  /**
   * Publishing is the act that approval performs: the listing machine's
   * `in_verification -> live` transition. Granting approval without publish
   * would leave approved inventory stuck, needing a second person with no
   * added control value.
   */
  'property:publish',
  'media:moderate',
  'property:suspend',
  'lead:view_all',
  'report:view',
];

const FINANCE: readonly Permission[] = [
  'property:view',
  'payment:view',
  'payment:refund',
  'invoice:issue',
  'statement:generate',
  'fee_rule:view',
  'marketing_spend:edit',
  'report:view',
  'audit:view',
];

const SUPER_ADMIN: readonly Permission[] = [
  ...PERMISSIONS.filter(
    // Even a super admin does not silently self-grant a trust badge; approving
    // verification requires the verifier role explicitly. This is the one
    // capability that is not absorbed by administrative power, because the badge
    // is a claim we make to residents about someone else's property.
    (p) => p !== 'verification:approve',
  ),
];

export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, readonly Permission[]>> = {
  rm: RM,
  rm_lead: RM_LEAD,
  ops: OPS,
  verifier: VERIFIER,
  finance: FINANCE,
  super_admin: SUPER_ADMIN,
};

/** Host-side permissions, always scoped to one organization. */
export const ORG_ROLE_PERMISSIONS: Readonly<Record<OrgRole, readonly Permission[]>> = {
  owner: [
    'property:view',
    'property:create',
    'property:edit',
    'property:submit_for_verification',
    'availability:edit',
    'media:upload',
    'organization:edit',
    'payment:view',
    'report:view',
  ],
  manager: [
    'property:view',
    'property:edit',
    'property:submit_for_verification',
    'availability:edit',
    'media:upload',
    'report:view',
  ],
  viewer: ['property:view', 'report:view'],
};

export class PermissionDeniedError extends Error {
  constructor(
    readonly permission: Permission,
    readonly roles: readonly string[],
  ) {
    super(
      `Permission denied: "${permission}" is not granted by role(s) ` +
        `[${roles.join(', ') || 'none'}].`,
    );
    this.name = 'PermissionDeniedError';
  }
}

/** Effective permission set for a set of staff roles. */
export function permissionsForRoles(roles: readonly StaffRole[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      result.add(permission);
    }
  }
  return result;
}

export function can(roles: readonly StaffRole[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

export function assertCan(roles: readonly StaffRole[], permission: Permission): void {
  if (!can(roles, permission)) {
    throw new PermissionDeniedError(permission, roles);
  }
}

export function orgCan(role: OrgRole, permission: Permission): boolean {
  return ORG_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Separation of duties.
 *
 * The person who created or last edited a property must not be the person who
 * certifies it. Without this, "Verified" means "we verified our own data entry"
 * — which is exactly the trust claim the PRD's §10 rests on, and a liability if
 * it turns out to be hollow (build plan concern #9).
 *
 * This is a data-dependent check, so it lives next to the permission model but
 * takes the relevant actors as arguments rather than reading them itself.
 */
export const SEPARATION_OF_DUTIES = {
  /**
   * True when `actorUserId` may approve verification for a subject that was
   * entered or last touched by `submittedByUserId`.
   */
  canApproveVerification(params: {
    actorUserId: string;
    actorRoles: readonly StaffRole[];
    /** Who created or last edited the property/organization under review. */
    submittedByUserId: string | null;
  }): { allowed: boolean; reason?: string } {
    if (!can(params.actorRoles, 'verification:approve')) {
      return {
        allowed: false,
        reason:
          'Approving a verification requires the `verifier` role. Note that ' +
          'super_admin deliberately does not include it.',
      };
    }
    if (
      params.submittedByUserId !== null &&
      params.submittedByUserId === params.actorUserId
    ) {
      return {
        allowed: false,
        reason:
          'You submitted this listing, so you cannot also certify it. A ' +
          'verification badge signed by its own author is not a trust signal. ' +
          'Route it to another verifier.',
      };
    }
    return { allowed: true };
  },
} as const;

/**
 * Permissions that must always produce an audit-log entry when exercised,
 * regardless of outcome. Bulk PII access and money movement are the events you
 * most need to reconstruct after an incident.
 */
export const ALWAYS_AUDITED: readonly Permission[] = [
  'export:pii',
  'payment:refund',
  'fee_rule:edit',
  'role:grant',
  'user:manage',
  'verification:approve',
  'call:listen_recording',
  'property:suspend',
  'organization:suspend',
  'dsr:handle',
];

import { describe, expect, it } from 'vitest';

import {
  ALWAYS_AUDITED,
  ORG_ROLE_PERMISSIONS,
  PERMISSIONS,
  type Permission,
  PermissionDeniedError,
  ROLE_PERMISSIONS,
  SEPARATION_OF_DUTIES,
  type StaffRole,
  assertCan,
  can,
  orgCan,
  permissionsForRoles,
} from './permissions';

describe('permission model integrity', () => {
  it('grants only declared permissions', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permission of granted) {
        expect(known.has(permission), `${role} grants unknown "${permission}"`).toBe(
          true,
        );
      }
    }
    for (const [role, granted] of Object.entries(ORG_ROLE_PERMISSIONS)) {
      for (const permission of granted) {
        expect(known.has(permission), `${role} grants unknown "${permission}"`).toBe(
          true,
        );
      }
    }
  });

  it('has no duplicate permission entries per role', () => {
    for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
      expect(new Set(granted).size, `${role} has duplicates`).toBe(granted.length);
    }
  });

  it('covers every declared permission by at least one role', () => {
    // An ungranted permission is dead weight — either wire it to a role or
    // delete it, rather than leaving it as a check nobody can ever pass.
    const grantedAnywhere = new Set<string>(
      Object.values(ROLE_PERMISSIONS).flatMap((p) => [...p]),
    );
    const orphans = PERMISSIONS.filter((p) => !grantedAnywhere.has(p));
    expect(orphans, `permissions granted to nobody: ${orphans.join(', ')}`).toEqual([]);
  });
});

describe('least privilege per role', () => {
  it('an RM sees only their own queue, not the whole desk', () => {
    expect(can(['rm'], 'lead:view_assigned')).toBe(true);
    expect(can(['rm'], 'lead:view_all')).toBe(false);
  });

  it('an RM cannot reassign leads or listen to recordings', () => {
    expect(can(['rm'], 'lead:reassign')).toBe(false);
    expect(can(['rm'], 'call:listen_recording')).toBe(false);
  });

  it('an RM lead can see the whole desk and QA recordings', () => {
    expect(can(['rm_lead'], 'lead:view_all')).toBe(true);
    expect(can(['rm_lead'], 'call:listen_recording')).toBe(true);
  });

  it('an RM can confirm availability — they hear it on the call', () => {
    expect(can(['rm'], 'availability:edit')).toBe(true);
  });

  it('no RM role can refund money', () => {
    expect(can(['rm'], 'payment:refund')).toBe(false);
    expect(can(['rm_lead'], 'payment:refund')).toBe(false);
    expect(can(['finance'], 'payment:refund')).toBe(true);
  });

  it('no RM role can edit fee rules', () => {
    expect(can(['rm'], 'fee_rule:edit')).toBe(false);
    expect(can(['rm_lead'], 'fee_rule:edit')).toBe(false);
  });

  it('ops can enter inventory but cannot certify it', () => {
    expect(can(['ops'], 'property:create')).toBe(true);
    expect(can(['ops'], 'property:edit')).toBe(true);
    expect(can(['ops'], 'verification:approve')).toBe(false);
  });

  it('a verifier can certify inventory but cannot enter or edit it', () => {
    // This is the whole point of splitting the role.
    expect(can(['verifier'], 'verification:approve')).toBe(true);
    expect(can(['verifier'], 'property:create')).toBe(false);
    expect(can(['verifier'], 'property:edit')).toBe(false);
  });

  it('a verifier can publish, because approval is what takes a listing live', () => {
    // The listing machine reaches `live` only from `in_verification`, so
    // separating approve from publish would strand approved inventory.
    expect(can(['verifier'], 'property:publish')).toBe(true);
    expect(can(['ops'], 'property:publish')).toBe(false);
  });

  it('finance cannot touch inventory or leads', () => {
    expect(can(['finance'], 'property:edit')).toBe(false);
    expect(can(['finance'], 'lead:edit')).toBe(false);
  });

  it('does not hand out PII export by default', () => {
    const canExport = (Object.keys(ROLE_PERMISSIONS) as StaffRole[]).filter((r) =>
      can([r], 'export:pii'),
    );
    expect(canExport).toEqual(['super_admin']);
  });

  it('combines permissions across multiple roles', () => {
    const combined = permissionsForRoles(['ops', 'verifier']);
    expect(combined.has('property:create')).toBe(true);
    expect(combined.has('verification:approve')).toBe(true);
  });

  it('treats an empty role list as no access', () => {
    expect(can([], 'lead:view_assigned')).toBe(false);
    expect(permissionsForRoles([]).size).toBe(0);
  });
});

describe('super_admin', () => {
  it('deliberately cannot approve a verification', () => {
    // Administrative power should not absorb the ability to sign a trust claim
    // about someone else's property.
    expect(can(['super_admin'], 'verification:approve')).toBe(false);
  });

  it('holds every other permission', () => {
    const missing = PERMISSIONS.filter(
      (p) => p !== 'verification:approve' && !can(['super_admin'], p),
    );
    expect(missing).toEqual([]);
  });
});

describe('assertCan()', () => {
  it('throws a message naming the permission and roles', () => {
    try {
      assertCan(['rm'], 'payment:refund');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect((error as Error).message).toContain('payment:refund');
      expect((error as Error).message).toContain('rm');
    }
  });

  it('passes silently when granted', () => {
    expect(() => assertCan(['finance'], 'payment:refund')).not.toThrow();
  });
});

describe('separation of duties on verification', () => {
  const verifier = { actorUserId: 'user-verifier', actorRoles: ['verifier'] as const };

  it('allows a verifier to approve someone else’s submission', () => {
    const result = SEPARATION_OF_DUTIES.canApproveVerification({
      ...verifier,
      submittedByUserId: 'user-ops',
    });
    expect(result.allowed).toBe(true);
  });

  it('refuses to let the submitter certify their own listing', () => {
    const result = SEPARATION_OF_DUTIES.canApproveVerification({
      actorUserId: 'user-ops',
      actorRoles: ['verifier', 'ops'],
      submittedByUserId: 'user-ops',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cannot also certify/);
  });

  it('refuses a non-verifier outright, including super_admin', () => {
    for (const role of ['ops', 'rm_lead', 'super_admin'] as StaffRole[]) {
      const result = SEPARATION_OF_DUTIES.canApproveVerification({
        actorUserId: 'someone',
        actorRoles: [role],
        submittedByUserId: 'other',
      });
      expect(result.allowed, `${role} should not approve`).toBe(false);
      expect(result.reason).toMatch(/requires the `verifier` role/);
    }
  });

  it('allows approval when the submitter is unknown', () => {
    // Imported or legacy inventory with no recorded author still needs a path
    // to being verified.
    const result = SEPARATION_OF_DUTIES.canApproveVerification({
      ...verifier,
      submittedByUserId: null,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('host-side org roles', () => {
  it('lets an owner edit the organization but a manager not', () => {
    expect(orgCan('owner', 'organization:edit')).toBe(true);
    expect(orgCan('manager', 'organization:edit')).toBe(false);
  });

  it('gives a viewer read-only access', () => {
    expect(orgCan('viewer', 'report:view')).toBe(true);
    expect(orgCan('viewer', 'property:edit')).toBe(false);
    expect(orgCan('viewer', 'availability:edit')).toBe(false);
  });

  it('never lets a host publish their own listing', () => {
    // Going live is a platform decision gated on verification, not a host one.
    for (const role of ['owner', 'manager', 'viewer'] as const) {
      expect(orgCan(role, 'property:publish'), `${role} must not publish`).toBe(false);
      expect(orgCan(role, 'verification:approve')).toBe(false);
    }
  });

  it('never lets a host see leads or place platform calls', () => {
    for (const role of ['owner', 'manager', 'viewer'] as const) {
      expect(orgCan(role, 'lead:view_all')).toBe(false);
      expect(orgCan(role, 'lead:view_assigned')).toBe(false);
      expect(orgCan(role, 'call:place')).toBe(false);
    }
  });
});

describe('ALWAYS_AUDITED', () => {
  it('only lists real permissions', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const permission of ALWAYS_AUDITED) {
      expect(known.has(permission), `unknown: ${permission}`).toBe(true);
    }
  });

  it('covers bulk PII access and money movement', () => {
    const required: Permission[] = ['export:pii', 'payment:refund', 'fee_rule:edit'];
    for (const permission of required) {
      expect(ALWAYS_AUDITED).toContain(permission);
    }
  });
});

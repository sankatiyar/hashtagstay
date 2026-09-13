import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createProperty } from '@/lib/services/properties';
import {
  VerificationError,
  approveVerification,
  expireLapsedVerifications,
  getActiveVerification,
  listVerificationHistory,
  rejectVerification,
  requestVerification,
  saveChecklist,
} from '@/lib/services/verification';
import { type Checklist, itemsForTier } from '@/lib/verification/rubric';

/**
 * Verification workflow, against a real database.
 *
 * The point of these is the guarantees that make the badge mean something:
 * separation of duties, the rubric deciding the tier, and expiry. Each is
 * enforced in the service, so each is tested there rather than through the UI.
 */

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
const client = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });

const SUFFIX = `ver-${Date.now()}`;

let orgId: string;
let opsUserId: string;
let verifierUserId: string;

const opsActor = () => ({
  id: opsUserId,
  label: `ops-${SUFFIX}`,
  roles: ['ops'] as const,
});
const verifierActor = () => ({
  id: verifierUserId,
  label: `verifier-${SUFFIX}`,
  roles: ['verifier'] as const,
});

function passing(tier: Parameters<typeof itemsForTier>[0]): Checklist {
  return Object.fromEntries(
    itemsForTier(tier).map((item) => [item.key, 'pass' as const]),
  );
}

async function cleanup() {
  await client`DELETE FROM audit_log WHERE actor_label LIKE ${'%' + SUFFIX}`;

  // Also remove audit rows written by a system actor (the expiry job) against
  // this run's records — those carry no run label, so the clause above misses
  // them and they accumulate in the dev database.
  await client`
    DELETE FROM audit_log
    WHERE entity_id IN (
      SELECT id FROM verifications WHERE subject_id IN (
        SELECT id FROM properties WHERE organization_id IN (
          SELECT id FROM organizations WHERE slug LIKE ${'%' + SUFFIX}
        )
      )
    )
  `;

  await client`
    DELETE FROM verifications
    WHERE subject_id IN (
      SELECT id FROM properties WHERE organization_id IN (
        SELECT id FROM organizations WHERE slug LIKE ${'%' + SUFFIX}
      )
    )
  `;
  await client`
    DELETE FROM properties
    WHERE organization_id IN (
      SELECT id FROM organizations WHERE slug LIKE ${'%' + SUFFIX}
    )
  `;
  await client`DELETE FROM organizations WHERE slug LIKE ${'%' + SUFFIX}`;
  await client`DELETE FROM users WHERE email LIKE ${'%' + SUFFIX}`;
}

/** A fresh draft property created by the ops user. */
async function newProperty(name: string) {
  return createProperty(
    {
      organizationId: orgId,
      name: `${name} ${SUFFIX}`,
      slug: undefined,
      description: undefined,
      propertyType: 'coliving',
      genderPolicy: 'any',
      addressLine1: '1 Verify Road',
      addressLine2: undefined,
      locality: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: '12.9784',
      longitude: '77.6408',
      amenities: ['wifi'],
      houseRules: [],
      rooms: [
        {
          name: 'Single',
          occupancy: 1,
          hasPrivateBathroom: true,
          rentAmountMinor: 1_500_000,
          depositAmountMinor: 3_000_000,
          minTenureMonths: 3,
        },
      ],
    },
    opsActor(),
  );
}

beforeAll(async () => {
  await cleanup();

  const [org] = await client<{ id: string }[]>`
    INSERT INTO organizations (name, slug)
    VALUES ('Verify Test Operator', ${'org-' + SUFFIX}) RETURNING id
  `;
  orgId = org.id;

  const [ops] = await client<{ id: string }[]>`
    INSERT INTO users (audience, email, full_name)
    VALUES ('staff', ${'ops-' + SUFFIX}, 'Ops Tester') RETURNING id
  `;
  opsUserId = ops.id;

  const [verifier] = await client<{ id: string }[]>`
    INSERT INTO users (audience, email, full_name)
    VALUES ('staff', ${'verifier-' + SUFFIX}, 'Verifier Tester') RETURNING id
  `;
  verifierUserId = verifier.id;
});

afterAll(async () => {
  await cleanup();
  await client.end({ timeout: 5 });
});

describe('requestVerification()', () => {
  it('opens a record and moves the listing into verification', async () => {
    const property = await newProperty('Open');
    await requestVerification(property.id, 'onground_audited', opsActor());

    const active = await getActiveVerification(property.id);
    expect(active).not.toBeNull();
    expect(active!.requestedTier).toBe('onground_audited');
    expect(active!.requestedByUserId).toBe(opsUserId);

    const [row] = await client<{ listing_state: string }[]>`
      SELECT listing_state FROM properties WHERE id = ${property.id}
    `;
    expect(row.listing_state).toBe('in_verification');
  });

  it('is idempotent — a second request reuses the open record', async () => {
    const property = await newProperty('Idempotent');
    const first = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    const second = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    expect(second.verificationId).toBe(first.verificationId);
  });

  it('throws for an unknown property', async () => {
    await expect(
      requestVerification(
        '00000000-0000-0000-0000-000000000000',
        'documents_checked',
        opsActor(),
      ),
    ).rejects.toThrow(VerificationError);
  });
});

describe('separation of duties', () => {
  it('refuses approval by the person who requested it', async () => {
    const property = await newProperty('Self Approve');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await saveChecklist(verificationId, passing('documents_checked'), null, opsActor());

    // Same user, and given the verifier role too — still refused. Holding both
    // roles must not let one person both submit and certify.
    await expect(
      approveVerification(verificationId, 'documents_checked', {
        id: opsUserId,
        label: `ops-${SUFFIX}`,
        roles: ['ops', 'verifier'],
      }),
    ).rejects.toThrow(/cannot also certify/);

    // And the property must be untouched by the refused attempt.
    const [row] = await client<{ verification_tier: string; listing_state: string }[]>`
      SELECT verification_tier, listing_state FROM properties WHERE id = ${property.id}
    `;
    expect(row.verification_tier).toBe('none');
    expect(row.listing_state).toBe('in_verification');
  });

  it('refuses approval by someone without the verifier role', async () => {
    const property = await newProperty('No Role');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await saveChecklist(verificationId, passing('documents_checked'), null, opsActor());

    await expect(
      approveVerification(verificationId, 'documents_checked', {
        id: verifierUserId,
        label: 'someone',
        roles: ['ops'],
      }),
    ).rejects.toThrow(/requires the `verifier` role/);
  });

  it('allows a different verifier to approve', async () => {
    const property = await newProperty('Other Verifier');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await saveChecklist(verificationId, passing('documents_checked'), null, opsActor());

    await expect(
      approveVerification(verificationId, 'documents_checked', verifierActor()),
    ).resolves.toBeUndefined();
  });
});

describe('the rubric decides the tier', () => {
  it('refuses a tier the checklist does not support, naming what is missing', async () => {
    const property = await newProperty('Insufficient');
    const { verificationId } = await requestVerification(
      property.id,
      'onground_audited',
      opsActor(),
    );
    // Only the document checks done, but asking for the top tier.
    await saveChecklist(verificationId, passing('documents_checked'), null, opsActor());

    await expect(
      approveVerification(verificationId, 'onground_audited', verifierActor()),
    ).rejects.toThrow(/Site visited in person/);
  });

  it('refuses when a required item is marked N/A but does not permit it', async () => {
    const property = await newProperty('Bad NA');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await saveChecklist(
      verificationId,
      { ...passing('documents_checked'), ownership_or_lease_proof: 'not_applicable' },
      null,
      opsActor(),
    );

    await expect(
      approveVerification(verificationId, 'documents_checked', verifierActor()),
    ).rejects.toThrow(/Ownership or lease proof/);
  });

  it('accepts N/A where the item permits it', async () => {
    const property = await newProperty('Good NA');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await saveChecklist(
      verificationId,
      { ...passing('documents_checked'), company_registration: 'not_applicable' },
      null,
      opsActor(),
    );

    await expect(
      approveVerification(verificationId, 'documents_checked', verifierActor()),
    ).resolves.toBeUndefined();
  });
});

describe('approveVerification()', () => {
  let propertyId: string;
  let verificationId: string;

  beforeEach(async () => {
    const property = await newProperty(
      `Approve ${Math.random().toString(36).slice(2, 7)}`,
    );
    propertyId = property.id;
    const opened = await requestVerification(
      propertyId,
      'onground_audited',
      opsActor(),
    );
    verificationId = opened.verificationId;
    await saveChecklist(verificationId, passing('onground_audited'), null, opsActor());
  });

  it('grants the tier, stamps an expiry, and publishes', async () => {
    await approveVerification(
      verificationId,
      'onground_audited',
      verifierActor(),
      'Visited 12 Sept, all good',
    );

    const [row] = await client<
      {
        verification_tier: string;
        listing_state: string;
        verified_at: Date | null;
        verification_expires_at: Date | null;
        published_at: Date | null;
      }[]
    >`
      SELECT verification_tier, listing_state, verified_at, verification_expires_at, published_at
      FROM properties WHERE id = ${propertyId}
    `;

    expect(row.verification_tier).toBe('onground_audited');
    // Publishing is what approval performs — the listing machine reaches live
    // only from in_verification, so approving without publishing would strand it.
    expect(row.listing_state).toBe('live');
    expect(row.verified_at).not.toBeNull();
    expect(row.published_at).not.toBeNull();
    // Every grant expires; an audit from two years ago must stop reading as current.
    expect(row.verification_expires_at).not.toBeNull();
    expect(row.verification_expires_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it('records the decision note and reviewer', async () => {
    await approveVerification(
      verificationId,
      'photos_verified',
      verifierActor(),
      'Photos cross-checked against street view',
    );

    const [record] = await client<
      { granted_tier: string; reviewed_by: string; decision_note: string }[]
    >`
      SELECT granted_tier, reviewed_by, decision_note FROM verifications
      WHERE id = ${verificationId}
    `;
    expect(record.granted_tier).toBe('photos_verified');
    expect(record.reviewed_by).toBe(verifierUserId);
    expect(record.decision_note).toMatch(/street view/);
  });

  it('audits both the grant and the publish', async () => {
    await approveVerification(verificationId, 'onground_audited', verifierActor());

    const entries = await client<
      { entity_type: string; after: Record<string, unknown> }[]
    >`
      SELECT entity_type, after FROM audit_log
      WHERE actor_label = ${`verifier-${SUFFIX}`} AND action = 'state_transition'
      ORDER BY created_at ASC
    `;
    const types = entries.map((e) => e.entity_type);
    expect(types).toContain('verifications');
    expect(types).toContain('properties');
  });

  it('refuses to approve the same verification twice', async () => {
    await approveVerification(verificationId, 'onground_audited', verifierActor());
    await expect(
      approveVerification(verificationId, 'onground_audited', verifierActor()),
    ).rejects.toThrow(/already approved/);
  });

  it('can grant a lower tier than requested', async () => {
    // The reviewer aimed at on-ground but only the document checks hold up.
    await approveVerification(verificationId, 'documents_checked', verifierActor());
    const [row] = await client<{ verification_tier: string }[]>`
      SELECT verification_tier FROM properties WHERE id = ${propertyId}
    `;
    expect(row.verification_tier).toBe('documents_checked');
  });
});

describe('rejectVerification()', () => {
  it('sends the listing back for changes with the reason recorded', async () => {
    const property = await newProperty('Reject');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );

    await rejectVerification(
      verificationId,
      'Lease forbids subletting',
      verifierActor(),
    );

    const [row] = await client<{ listing_state: string }[]>`
      SELECT listing_state FROM properties WHERE id = ${property.id}
    `;
    // Not left stuck in verification where nobody owns it.
    expect(row.listing_state).toBe('changes_requested');

    const [record] = await client<{ state: string; decision_note: string }[]>`
      SELECT state, decision_note FROM verifications WHERE id = ${verificationId}
    `;
    expect(record.state).toBe('rejected');
    expect(record.decision_note).toBe('Lease forbids subletting');
  });

  it('requires a reason — the operator has to know what to fix', async () => {
    const property = await newProperty('Reject No Reason');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );

    await expect(
      rejectVerification(verificationId, '   ', verifierActor()),
    ).rejects.toThrow(/needs a reason/);
  });

  it('leaves the property unverified', async () => {
    const property = await newProperty('Reject Tier');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await rejectVerification(verificationId, 'Documents unreadable', verifierActor());

    const [row] = await client<{ verification_tier: string }[]>`
      SELECT verification_tier FROM properties WHERE id = ${property.id}
    `;
    expect(row.verification_tier).toBe('none');
  });
});

describe('expireLapsedVerifications()', () => {
  it('expires a grant whose date has passed and leaves the listing live', async () => {
    const property = await newProperty('Expiring');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await saveChecklist(verificationId, passing('documents_checked'), null, opsActor());
    await approveVerification(verificationId, 'documents_checked', verifierActor());

    // Backdate the expiry rather than waiting two years.
    await client`
      UPDATE verifications SET expires_at = now() - interval '1 day'
      WHERE id = ${verificationId}
    `;

    const expired = await expireLapsedVerifications();
    expect(expired).toContain(verificationId);

    const [record] = await client<{ state: string }[]>`
      SELECT state FROM verifications WHERE id = ${verificationId}
    `;
    expect(record.state).toBe('expired');

    // Deliberately still live: an expired badge means "we no longer vouch for
    // this", not "this property vanished". Pulling inventory automatically is a
    // bigger decision than a cron job should make.
    const [row] = await client<{ listing_state: string }[]>`
      SELECT listing_state FROM properties WHERE id = ${property.id}
    `;
    expect(row.listing_state).toBe('live');
  });

  it('leaves an unexpired grant alone', async () => {
    const property = await newProperty('Not Expiring');
    const { verificationId } = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await saveChecklist(verificationId, passing('documents_checked'), null, opsActor());
    await approveVerification(verificationId, 'documents_checked', verifierActor());

    const expired = await expireLapsedVerifications();
    expect(expired).not.toContain(verificationId);
  });
});

describe('history', () => {
  it('keeps past decisions rather than overwriting them', async () => {
    const property = await newProperty('History');
    const first = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );
    await rejectVerification(first.verificationId, 'Missing lease', verifierActor());

    // Rejected sends it to changes_requested; ops resubmits.
    await client`
      UPDATE properties SET listing_state = 'submitted' WHERE id = ${property.id}
    `;
    const second = await requestVerification(
      property.id,
      'documents_checked',
      opsActor(),
    );

    const history = await listVerificationHistory(property.id);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.map((h) => h.id)).toContain(first.verificationId);
    expect(history.map((h) => h.id)).toContain(second.verificationId);
  });
});

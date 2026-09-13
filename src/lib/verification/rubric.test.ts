import { describe, expect, it } from 'vitest';

import {
  type Checklist,
  RUBRIC,
  TIER_ORDER,
  canGrant,
  evaluateTier,
  expiryFor,
  itemsForTier,
  itemsIntroducedAt,
  missingItemsFor,
  rubricItem,
  tierRank,
} from './rubric';

/** Every item for `tier` marked pass. */
function passing(tier: Parameters<typeof itemsForTier>[0]): Checklist {
  return Object.fromEntries(
    itemsForTier(tier).map((item) => [item.key, 'pass' as const]),
  );
}

describe('rubric integrity', () => {
  it('has unique item keys', () => {
    const keys = RUBRIC.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('assigns every item to a real tier', () => {
    for (const item of RUBRIC) {
      expect(TIER_ORDER).toContain(item.requiredFrom);
      expect(item.requiredFrom).not.toBe('none');
    }
  });

  it('gives every item guidance a reviewer can act on', () => {
    for (const item of RUBRIC) {
      expect(item.guidance.length).toBeGreaterThan(30);
    }
  });

  it('introduces items at each tier', () => {
    expect(itemsIntroducedAt('documents_checked').length).toBeGreaterThan(0);
    expect(itemsIntroducedAt('photos_verified').length).toBeGreaterThan(0);
    expect(itemsIntroducedAt('onground_audited').length).toBeGreaterThan(0);
  });

  it('looks items up by key', () => {
    expect(rubricItem('site_visited')?.requiredFrom).toBe('onground_audited');
    expect(rubricItem('nope')).toBeUndefined();
  });
});

describe('itemsForTier()', () => {
  it('returns nothing for the unverified tier', () => {
    expect(itemsForTier('none')).toEqual([]);
  });

  it('is cumulative — a higher tier includes the lower ones', () => {
    const docs = itemsForTier('documents_checked');
    const photos = itemsForTier('photos_verified');
    const onground = itemsForTier('onground_audited');

    expect(photos.length).toBeGreaterThan(docs.length);
    expect(onground.length).toBeGreaterThan(photos.length);
    // Every documents item still applies at the top tier.
    for (const item of docs) {
      expect(onground.map((i) => i.key)).toContain(item.key);
    }
  });

  it('includes every rubric item at the top tier', () => {
    expect(itemsForTier('onground_audited')).toHaveLength(RUBRIC.length);
  });
});

describe('missingItemsFor()', () => {
  it('is empty when everything required passes', () => {
    expect(missingItemsFor('documents_checked', passing('documents_checked'))).toEqual(
      [],
    );
  });

  it('reports an unanswered item as missing', () => {
    const checklist = passing('documents_checked');
    delete checklist.contact_reachable;
    expect(missingItemsFor('documents_checked', checklist).map((i) => i.key)).toEqual([
      'contact_reachable',
    ]);
  });

  it('reports a failed item as missing', () => {
    const checklist = {
      ...passing('documents_checked'),
      contact_reachable: 'fail' as const,
    };
    expect(missingItemsFor('documents_checked', checklist)).toHaveLength(1);
  });

  it('accepts not_applicable only where the item permits it', () => {
    const allowed = {
      ...passing('documents_checked'),
      company_registration: 'not_applicable' as const,
    };
    expect(missingItemsFor('documents_checked', allowed)).toEqual([]);

    // ownership proof can never be N/A — otherwise a reviewer could mark every
    // awkward check N/A and still grant the badge.
    const disallowed = {
      ...passing('documents_checked'),
      ownership_or_lease_proof: 'not_applicable' as const,
    };
    expect(missingItemsFor('documents_checked', disallowed).map((i) => i.key)).toEqual([
      'ownership_or_lease_proof',
    ]);
  });

  it('reports higher-tier gaps when only the lower tier is complete', () => {
    const missing = missingItemsFor('onground_audited', passing('documents_checked'));
    expect(missing.map((i) => i.key)).toContain('site_visited');
    expect(missing.map((i) => i.key)).toContain('photos_depict_property');
  });
});

describe('evaluateTier()', () => {
  it('returns none for an empty checklist', () => {
    expect(evaluateTier({})).toBe('none');
  });

  it('returns the highest fully-satisfied tier', () => {
    expect(evaluateTier(passing('documents_checked'))).toBe('documents_checked');
    expect(evaluateTier(passing('photos_verified'))).toBe('photos_verified');
    expect(evaluateTier(passing('onground_audited'))).toBe('onground_audited');
  });

  it('stops at the first unmet tier even if a higher one is complete', () => {
    // Site visit done but documents incomplete: the ladder is cumulative, so
    // this is not an on-ground audit. Passing the top checks while skipping
    // ownership proof must not yield the strongest badge.
    const checklist: Checklist = {
      ...passing('onground_audited'),
      ownership_or_lease_proof: 'fail',
    };
    expect(evaluateTier(checklist)).toBe('none');
  });

  it('does not promote past a partially-complete tier', () => {
    const checklist: Checklist = {
      ...passing('documents_checked'),
      photos_depict_property: 'pass',
      // photos_not_duplicated, rooms_match_listing, pricing_confirmed unanswered
    };
    expect(evaluateTier(checklist)).toBe('documents_checked');
  });
});

describe('canGrant()', () => {
  it('permits a tier the checklist supports', () => {
    expect(canGrant('documents_checked', passing('documents_checked'))).toEqual({
      ok: true,
    });
  });

  it('refuses and names what is missing', () => {
    const result = canGrant('onground_audited', passing('photos_verified'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing.map((i) => i.key)).toContain('site_visited');
    }
  });

  it('always permits none', () => {
    expect(canGrant('none', {}).ok).toBe(true);
  });
});

describe('expiryFor()', () => {
  const from = new Date('2026-09-12T00:00:00.000Z');

  it('gives no expiry for the unverified tier', () => {
    expect(expiryFor('none', from)).toBeNull();
  });

  it('expires an on-ground audit sooner than a document check', () => {
    // A building inspected two years ago tells a resident very little today.
    const onground = expiryFor('onground_audited', from)!;
    const docs = expiryFor('documents_checked', from)!;
    expect(onground.getTime()).toBeLessThan(docs.getTime());
  });

  it('sets a document check two years out', () => {
    expect(expiryFor('documents_checked', from)!.getUTCFullYear()).toBe(2028);
  });

  it('sets photo and on-ground checks a year out', () => {
    expect(expiryFor('photos_verified', from)!.getUTCFullYear()).toBe(2027);
    expect(expiryFor('onground_audited', from)!.getUTCFullYear()).toBe(2027);
  });
});

describe('tierRank()', () => {
  it('orders the tiers', () => {
    expect(tierRank('none')).toBeLessThan(tierRank('documents_checked'));
    expect(tierRank('documents_checked')).toBeLessThan(tierRank('photos_verified'));
    expect(tierRank('photos_verified')).toBeLessThan(tierRank('onground_audited'));
  });
});

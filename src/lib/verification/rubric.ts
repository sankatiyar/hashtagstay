/**
 * Verification rubric.
 *
 * "Verified" as a bare word implies we stand behind the property, which is a
 * liability and — worse — a promise a resident relies on when booking
 * sight-unseen from another city. So each tier is defined by an explicit
 * checklist, and the tier a property holds is exactly the set of checks that
 * were actually performed.
 *
 * Tiers are **cumulative**: `photos_verified` includes everything
 * `documents_checked` requires. Granting a higher tier therefore requires
 * passing the lower tiers' items too, which is enforced by
 * `evaluateTier`/`missingItemsFor` rather than left to a reviewer's memory.
 *
 * The `residentFacing` strings are the customer-visible claim and need legal
 * review before they appear on a public listing page.
 */

export type VerificationTier =
  'none' | 'documents_checked' | 'photos_verified' | 'onground_audited';

/** Ascending order. Index is the tier's rank. */
export const TIER_ORDER: readonly VerificationTier[] = [
  'none',
  'documents_checked',
  'photos_verified',
  'onground_audited',
];

export const tierRank = (tier: VerificationTier): number => TIER_ORDER.indexOf(tier);

export type ChecklistOutcome = 'pass' | 'fail' | 'not_applicable';

export interface RubricItem {
  readonly key: string;
  readonly label: string;
  /** What the reviewer must actually look at. Shown beside the control. */
  readonly guidance: string;
  /** The lowest tier that requires this item. */
  readonly requiredFrom: Exclude<VerificationTier, 'none'>;
  /**
   * When true, `not_applicable` is an acceptable outcome. Used where a check
   * genuinely does not apply — an individual homeshare host has no company
   * registration to produce.
   */
  readonly allowNotApplicable?: boolean;
}

export const RUBRIC: readonly RubricItem[] = [
  // --- documents_checked --------------------------------------------------
  {
    key: 'ownership_or_lease_proof',
    label: 'Ownership or lease proof',
    guidance:
      'A sale deed, tax receipt, or a lease that actually grants the operator the right to sublet. A rent agreement that forbids subletting is a fail, not a pass.',
    requiredFrom: 'documents_checked',
  },
  {
    key: 'operator_identity',
    label: 'Operator identity',
    guidance:
      'Government photo ID for an individual host, or PAN plus certificate of incorporation for a company. The name must match the ownership document.',
    requiredFrom: 'documents_checked',
  },
  {
    key: 'company_registration',
    label: 'Company registration',
    guidance:
      'CIN or GSTIN for a registered operator. Not applicable for an individual homeshare host.',
    requiredFrom: 'documents_checked',
    allowNotApplicable: true,
  },
  {
    key: 'address_matches_documents',
    label: 'Address matches the documents',
    guidance:
      'The address on the listing is the address on the ownership document. A mismatch is the most common sign of a relisted or fabricated property.',
    requiredFrom: 'documents_checked',
  },
  {
    key: 'contact_reachable',
    label: 'Operator contactable',
    guidance:
      'Someone answered on the registered number and could speak for the property.',
    requiredFrom: 'documents_checked',
  },

  // --- photos_verified ----------------------------------------------------
  {
    key: 'photos_depict_property',
    label: 'Photos depict this property',
    guidance:
      'The photos are of this building, not a generic interior or a competitor listing. Cross-check the exterior against the street address.',
    requiredFrom: 'photos_verified',
  },
  {
    key: 'photos_not_duplicated',
    label: 'Photos not used elsewhere',
    guidance:
      'No perceptual-hash match against another property. Host-supplied photos are routinely lifted from other sites.',
    requiredFrom: 'photos_verified',
  },
  {
    key: 'rooms_match_listing',
    label: 'Room types match the listing',
    guidance:
      'The occupancy and room count in the photos are consistent with the room types entered. Three beds in a "single occupancy" photo is a fail.',
    requiredFrom: 'photos_verified',
  },
  {
    key: 'pricing_confirmed',
    label: 'Pricing confirmed with the operator',
    guidance:
      'Rent, deposit and minimum tenure were read back to the operator and agreed. This is what we will quote a resident.',
    requiredFrom: 'photos_verified',
  },

  // --- onground_audited ---------------------------------------------------
  {
    key: 'site_visited',
    label: 'Site visited in person',
    guidance:
      'A member of our team physically attended. Record the date and who went in the note.',
    requiredFrom: 'onground_audited',
  },
  {
    key: 'safety_equipment_present',
    label: 'Safety provisions present',
    guidance:
      'Fire extinguishers or equivalent, lit stairwells and corridors, and working locks. Any claimed safety amenity was seen, not just asserted.',
    requiredFrom: 'onground_audited',
  },
  {
    key: 'amenities_as_claimed',
    label: 'Amenities as claimed',
    guidance:
      'Every amenity on the listing exists. Remove any that do not rather than passing this with a caveat.',
    requiredFrom: 'onground_audited',
  },
  {
    key: 'gender_policy_observed',
    label: 'Gender policy as stated',
    guidance:
      'A women-only or segregated-floors claim is observably true on site. This is the claim solo and female residents rely on most, so it is never taken on trust.',
    requiredFrom: 'onground_audited',
  },
  {
    key: 'occupancy_plausible',
    label: 'Occupancy plausible',
    guidance:
      'The bed count is physically possible in the space seen. Overstated capacity is how a confirmed booking becomes no bed on arrival.',
    requiredFrom: 'onground_audited',
  },
];

const BY_KEY = new Map(RUBRIC.map((item) => [item.key, item]));

export const rubricItem = (key: string): RubricItem | undefined => BY_KEY.get(key);

/** Items required to reach `tier`, cumulative across lower tiers. */
export function itemsForTier(tier: VerificationTier): RubricItem[] {
  const target = tierRank(tier);
  if (target <= 0) return [];
  return RUBRIC.filter((item) => tierRank(item.requiredFrom) <= target);
}

/** Items introduced at exactly this tier, for grouping the review UI. */
export const itemsIntroducedAt = (tier: VerificationTier): RubricItem[] =>
  RUBRIC.filter((item) => item.requiredFrom === tier);

export type Checklist = Record<string, ChecklistOutcome>;

/**
 * Which required items are not yet satisfied for `tier`.
 *
 * `not_applicable` counts as satisfied only where the item permits it —
 * otherwise a reviewer could mark every awkward check N/A and still grant the
 * badge, which would hollow it out entirely.
 */
export function missingItemsFor(
  tier: VerificationTier,
  checklist: Checklist,
): RubricItem[] {
  return itemsForTier(tier).filter((item) => {
    const outcome = checklist[item.key];
    if (outcome === 'pass') return false;
    if (outcome === 'not_applicable' && item.allowNotApplicable) return false;
    return true;
  });
}

/** The highest tier the checklist actually supports. */
export function evaluateTier(checklist: Checklist): VerificationTier {
  let granted: VerificationTier = 'none';
  for (const tier of TIER_ORDER) {
    if (tier === 'none') continue;
    if (missingItemsFor(tier, checklist).length === 0) {
      granted = tier;
    } else {
      // Tiers are cumulative, so the first unmet tier stops the ladder.
      break;
    }
  }
  return granted;
}

export function canGrant(
  tier: VerificationTier,
  checklist: Checklist,
): { ok: true } | { ok: false; missing: RubricItem[] } {
  const missing = missingItemsFor(tier, checklist);
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/**
 * How long a granted tier stands before it must be renewed.
 *
 * An on-ground audit ages fastest in usefulness: a building inspected two years
 * ago tells a resident very little today, and the badge must not keep implying
 * otherwise. Document checks age more slowly because ownership rarely changes.
 */
const VALIDITY_MONTHS: Record<Exclude<VerificationTier, 'none'>, number> = {
  documents_checked: 24,
  photos_verified: 12,
  onground_audited: 12,
};

export function expiryFor(
  tier: VerificationTier,
  from: Date = new Date(),
): Date | null {
  if (tier === 'none') return null;
  const expires = new Date(from);
  expires.setMonth(expires.getMonth() + VALIDITY_MONTHS[tier]);
  return expires;
}

export const TIER_LABELS: Record<VerificationTier, string> = {
  none: 'Unverified',
  documents_checked: 'Documents checked',
  photos_verified: 'Photos verified',
  onground_audited: 'On-ground audited',
};

/** The resident-facing claim for each tier. Needs legal review before launch. */
export const TIER_RESIDENT_FACING: Record<VerificationTier, string> = {
  none: 'No verification checks have been completed.',
  documents_checked:
    'Ownership or lease proof and operator identity were reviewed by our team. The property itself has not been visited.',
  photos_verified:
    'Documents reviewed, and the listing photos were confirmed to depict this property. The property has not been visited.',
  onground_audited:
    'Documents reviewed, photos confirmed, and a member of our team visited the property in person.',
};

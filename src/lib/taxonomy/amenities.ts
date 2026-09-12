/**
 * Amenity taxonomy.
 *
 * A code constant rather than a table: amenities are a closed vocabulary we
 * control, they are read as a set for filtering and display, and they are never
 * joined or aggregated on their own. Properties store the slugs in a jsonb
 * array (see `properties.amenities`).
 *
 * Slugs are the stable contract — they end up in URLs, saved filters and
 * analytics. **Never rename a slug**; add a new one and migrate the data.
 * Labels can change freely.
 */

export type AmenityCategory =
  'essentials' | 'food' | 'services' | 'safety' | 'community' | 'accessibility';

export interface Amenity {
  readonly slug: string;
  readonly label: string;
  readonly category: AmenityCategory;
  /**
   * Shown as a primary filter chip on search. Kept deliberately short — a
   * filter bar with thirty options filters nothing.
   */
  readonly isPrimaryFilter?: boolean;
  /**
   * Weighted in the trust/safety presentation for solo and female residents,
   * which the PRD positions as the core differentiator (§10).
   */
  readonly isSafetySignal?: boolean;
}

export const AMENITIES: readonly Amenity[] = [
  // --- Essentials ---------------------------------------------------------
  { slug: 'wifi', label: 'Wi-Fi', category: 'essentials', isPrimaryFilter: true },
  {
    slug: 'ac',
    label: 'Air conditioning',
    category: 'essentials',
    isPrimaryFilter: true,
  },
  {
    slug: 'attached_bathroom',
    label: 'Attached bathroom',
    category: 'essentials',
    isPrimaryFilter: true,
  },
  { slug: 'hot_water', label: 'Hot water', category: 'essentials' },
  {
    slug: 'furnished',
    label: 'Fully furnished',
    category: 'essentials',
    isPrimaryFilter: true,
  },
  { slug: 'study_desk', label: 'Study desk', category: 'essentials' },
  { slug: 'wardrobe', label: 'Wardrobe', category: 'essentials' },
  {
    slug: 'power_backup',
    label: 'Power backup',
    category: 'essentials',
    isPrimaryFilter: true,
  },
  { slug: 'lift', label: 'Lift', category: 'essentials' },
  { slug: 'parking_two_wheeler', label: 'Two-wheeler parking', category: 'essentials' },
  { slug: 'parking_car', label: 'Car parking', category: 'essentials' },

  // --- Food ---------------------------------------------------------------
  {
    slug: 'meals_included',
    label: 'Meals included',
    category: 'food',
    isPrimaryFilter: true,
  },
  { slug: 'meals_veg_only', label: 'Vegetarian-only kitchen', category: 'food' },
  {
    slug: 'kitchen_access',
    label: 'Kitchen access',
    category: 'food',
    isPrimaryFilter: true,
  },
  { slug: 'water_purifier', label: 'Water purifier', category: 'food' },
  { slug: 'refrigerator', label: 'Refrigerator', category: 'food' },

  // --- Services -----------------------------------------------------------
  {
    slug: 'housekeeping',
    label: 'Housekeeping',
    category: 'services',
    isPrimaryFilter: true,
  },
  { slug: 'laundry', label: 'Laundry', category: 'services', isPrimaryFilter: true },
  { slug: 'maintenance', label: 'Maintenance support', category: 'services' },
  { slug: 'no_broker_fee', label: 'No brokerage', category: 'services' },

  // --- Safety -------------------------------------------------------------
  // Weighted in the trust presentation. A resident relocating sight-unseen is
  // buying reassurance as much as a room.
  {
    slug: 'cctv',
    label: 'CCTV',
    category: 'safety',
    isPrimaryFilter: true,
    isSafetySignal: true,
  },
  {
    slug: 'security_24x7',
    label: '24x7 security',
    category: 'safety',
    isPrimaryFilter: true,
    isSafetySignal: true,
  },
  {
    slug: 'biometric_entry',
    label: 'Biometric entry',
    category: 'safety',
    isSafetySignal: true,
  },
  {
    slug: 'warden_on_site',
    label: 'Warden on site',
    category: 'safety',
    isSafetySignal: true,
  },
  {
    slug: 'female_staff',
    label: 'Female staff on site',
    category: 'safety',
    isSafetySignal: true,
  },
  {
    slug: 'gated_community',
    label: 'Gated community',
    category: 'safety',
    isSafetySignal: true,
  },
  {
    slug: 'fire_safety',
    label: 'Fire safety equipment',
    category: 'safety',
    isSafetySignal: true,
  },
  {
    slug: 'visitor_log',
    label: 'Visitor register',
    category: 'safety',
    isSafetySignal: true,
  },
  { slug: 'no_entry_curfew', label: 'No entry curfew', category: 'safety' },

  // --- Community ----------------------------------------------------------
  { slug: 'common_area', label: 'Common lounge', category: 'community' },
  { slug: 'gym', label: 'Gym', category: 'community', isPrimaryFilter: true },
  { slug: 'games_room', label: 'Games room', category: 'community' },
  { slug: 'tv_lounge', label: 'TV lounge', category: 'community' },
  { slug: 'terrace', label: 'Terrace access', category: 'community' },
  { slug: 'events', label: 'Community events', category: 'community' },
  {
    slug: 'coworking',
    label: 'Co-working space',
    category: 'community',
    isPrimaryFilter: true,
  },
  { slug: 'pet_friendly', label: 'Pet friendly', category: 'community' },

  // --- Accessibility ------------------------------------------------------
  {
    slug: 'wheelchair_access',
    label: 'Wheelchair accessible',
    category: 'accessibility',
  },
  {
    slug: 'ground_floor_rooms',
    label: 'Ground-floor rooms',
    category: 'accessibility',
  },
] as const;

export type AmenitySlug = (typeof AMENITIES)[number]['slug'];

const BY_SLUG = new Map(AMENITIES.map((a) => [a.slug, a]));

export const amenityBySlug = (slug: string): Amenity | undefined => BY_SLUG.get(slug);

export const isKnownAmenity = (slug: string): boolean => BY_SLUG.has(slug);

/** Filter out unknown slugs rather than rendering a blank chip for stale data. */
export const resolveAmenities = (slugs: readonly string[]): Amenity[] =>
  slugs.map((s) => BY_SLUG.get(s)).filter((a): a is Amenity => a !== undefined);

export const primaryFilterAmenities = AMENITIES.filter((a) => a.isPrimaryFilter);

export const safetyAmenities = AMENITIES.filter((a) => a.isSafetySignal);

export const amenitiesByCategory = (category: AmenityCategory): Amenity[] =>
  AMENITIES.filter((a) => a.category === category);

/**
 * House rules are a separate vocabulary from amenities: an amenity is something
 * the property gives you, a rule is something it asks of you. Conflating them
 * makes "no smoking" read as a feature.
 */
export const HOUSE_RULES: readonly { slug: string; label: string }[] = [
  { slug: 'no_smoking', label: 'No smoking' },
  { slug: 'no_alcohol', label: 'No alcohol' },
  { slug: 'no_non_veg', label: 'No non-vegetarian food' },
  { slug: 'no_opposite_gender_visitors', label: 'No opposite-gender visitors' },
  { slug: 'no_loud_music', label: 'No loud music after 10pm' },
  { slug: 'entry_curfew', label: 'Entry curfew applies' },
  { slug: 'no_pets', label: 'No pets' },
  { slug: 'id_proof_required', label: 'Government ID required at move-in' },
  { slug: 'police_verification', label: 'Police verification required' },
  { slug: 'min_tenure_applies', label: 'Minimum tenure applies' },
] as const;

const RULES_BY_SLUG = new Map(HOUSE_RULES.map((r) => [r.slug, r]));

export const isKnownHouseRule = (slug: string): boolean => RULES_BY_SLUG.has(slug);

export const resolveHouseRules = (slugs: readonly string[]) =>
  slugs
    .map((s) => RULES_BY_SLUG.get(s))
    .filter((r): r is { slug: string; label: string } => r !== undefined);

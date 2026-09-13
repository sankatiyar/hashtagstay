import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { availability, institutions, properties, roomTypes } from '@/lib/db/schema';
import { type LatLng } from '@/lib/db/schema/columns';
import { withinKm } from '@/lib/geo';

/**
 * Public, resident-facing search (FR-01, FR-02, FR-03).
 *
 * Two rules hold everywhere in this module, and both are load-bearing:
 *
 * 1. **Only `live` listings.** Draft, in-verification, paused, suspended and
 *    archived inventory is invisible. Nothing reaches a resident without having
 *    passed verification.
 *
 * 2. **Never select operator contact details.** `organizations.contactPhone`
 *    and `contactEmail` are deliberately absent from every projection here.
 *    The moment a host's number reaches a resident, the booking can happen
 *    off-platform and we earn nothing — and with fee-only money flow there is
 *    no payment chokepoint to fall back on. Contact happens through a masked
 *    number, arranged by an RM. If you find yourself adding a contact column to
 *    a public query, that is the bug.
 */

export interface SearchFilters {
  city?: string;
  propertyType?: 'pbsa' | 'coliving' | 'homeshare';
  /** Matches listings that accept this preference, plus `any`. */
  genderPolicy?: 'male_only' | 'female_only';
  /** Budget ceiling per month, in minor units. Matches the cheapest room. */
  maxRentMinor?: number;
  /** Minimum beds in a room: 1 = private, 2 = twin sharing, etc. */
  maxOccupancy?: number;
  /** All must be present (AND), not any. */
  amenities?: string[];
  /** Slug of an institution to measure distance from. */
  institutionSlug?: string;
  radiusKm?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'distance';
  page?: number;
  pageSize?: number;
}

export interface SearchResultRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  locality: string | null;
  propertyType: string;
  genderPolicy: string;
  verificationTier: string;
  amenities: string[];
  /** Cheapest room's monthly rent, in minor units. */
  fromRentMinor: number;
  bedsFree: number;
  roomTypeCount: number;
  /** Metres from the requested institution, when one was given. */
  distanceMeters: number | null;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_RADIUS_KM = 5;

export interface PublicInstitution {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string | null;
  location: { x: number; y: number } | null;
}

/**
 * Resolve an institution slug to its coordinate, for proximity search.
 *
 * The return type is annotated rather than inferred: `rows[0]` is typed
 * non-optional without `noUncheckedIndexedAccess`, so `rows[0] ?? null` infers
 * as non-nullable and callers lose the null case.
 */
export async function findInstitution(slug: string): Promise<PublicInstitution | null> {
  const [row] = await db
    .select({
      id: institutions.id,
      name: institutions.name,
      slug: institutions.slug,
      city: institutions.city,
      state: institutions.state,
      location: institutions.location,
    })
    .from(institutions)
    .where(and(eq(institutions.slug, slug), eq(institutions.isPublished, true)))
    .limit(1);

  return row ?? null;
}

export async function searchListings(filters: SearchFilters = {}): Promise<{
  rows: SearchResultRow[];
  total: number;
  page: number;
  pageSize: number;
  institution: PublicInstitution | null;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const institution = filters.institutionSlug
    ? await findInstitution(filters.institutionSlug)
    : null;

  const origin: LatLng | null = institution?.location
    ? { lat: institution.location.y, lng: institution.location.x }
    : null;

  const conditions = [
    // Rule 1: nothing but live inventory.
    eq(properties.listingState, 'live'),
    isNull(properties.deletedAt),
  ];

  if (filters.city) {
    conditions.push(eq(properties.city, filters.city));
  }
  if (filters.propertyType) {
    conditions.push(eq(properties.propertyType, filters.propertyType));
  }
  if (filters.genderPolicy) {
    // A resident filtering for women-only accommodation should also see
    // mixed-gender properties that accept them, but never men-only ones.
    //
    // `inArray` rather than an interpolated `sql.raw` list: this value arrives
    // from a URL query parameter, so it must be bound as a parameter even
    // though the TypeScript type is a union. A raw interpolation here would be
    // an injection point reachable by anyone with a browser.
    conditions.push(
      inArray(properties.genderPolicy, [
        filters.genderPolicy,
        'any',
        'co_ed_segregated_floors',
      ]),
    );
  }
  if (filters.amenities && filters.amenities.length > 0) {
    // `@>` is jsonb containment: every requested amenity must be present.
    conditions.push(
      sql`${properties.amenities} @> ${JSON.stringify(filters.amenities)}::jsonb`,
    );
  }
  if (origin) {
    conditions.push(
      withinKm(properties.location, origin, filters.radiusKm ?? DEFAULT_RADIUS_KM),
    );
  }

  const distanceExpr = origin
    ? sql<number>`round(ST_Distance(${properties.location}::geography, ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography))::int`
    : sql<number | null>`NULL::int`;

  const havingConditions = [];
  if (filters.maxRentMinor !== undefined) {
    // Compare against the cheapest room: a property with a ₹9,000 triple and a
    // ₹25,000 single is within a ₹12,000 budget.
    havingConditions.push(
      sql`min(${roomTypes.rentAmountMinor}) <= ${filters.maxRentMinor}`,
    );
  }
  if (filters.maxOccupancy !== undefined) {
    havingConditions.push(sql`min(${roomTypes.occupancy}) <= ${filters.maxOccupancy}`);
  }

  const where = and(...conditions);
  const having = havingConditions.length > 0 ? and(...havingConditions) : undefined;

  const orderBy = (() => {
    switch (filters.sort) {
      case 'price_asc':
        return sql`min(${roomTypes.rentAmountMinor}) asc`;
      case 'price_desc':
        return sql`min(${roomTypes.rentAmountMinor}) desc`;
      case 'distance':
        return origin ? sql`${distanceExpr} asc` : sql`${properties.name} asc`;
      default:
        /**
         * Default ordering favours inventory a resident can actually take:
         * verified first, then something free, then distance or name. Showing an
         * unverified listing with no beds at the top would waste the click and
         * the RM's follow-up.
         */
        return origin
          ? sql`
              (${properties.verificationTier} = 'onground_audited') desc,
              (coalesce(sum(${availability.availableCount}), 0) > 0) desc,
              ${distanceExpr} asc`
          : sql`
              (${properties.verificationTier} = 'onground_audited') desc,
              (coalesce(sum(${availability.availableCount}), 0) > 0) desc,
              min(${roomTypes.rentAmountMinor}) asc`;
    }
  })();

  const base = db
    .select({
      id: properties.id,
      name: properties.name,
      slug: properties.slug,
      city: properties.city,
      locality: properties.locality,
      propertyType: properties.propertyType,
      genderPolicy: properties.genderPolicy,
      verificationTier: properties.verificationTier,
      amenities: properties.amenities,
      fromRentMinor: sql<number>`min(${roomTypes.rentAmountMinor})::int`,
      bedsFree: sql<number>`coalesce(sum(${availability.availableCount}), 0)::int`,
      roomTypeCount: sql<number>`count(distinct ${roomTypes.id})::int`,
      distanceMeters: distanceExpr,
    })
    .from(properties)
    // Inner join: a property with no sellable room is not a listing.
    .innerJoin(
      roomTypes,
      and(
        eq(roomTypes.propertyId, properties.id),
        eq(roomTypes.isActive, true),
        isNull(roomTypes.deletedAt),
      ),
    )
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(where)
    .groupBy(properties.id);

  const rows = await (having ? base.having(having) : base)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Count distinct properties matching the same predicate. Counting the grouped
  // query directly would count rows per group, not groups.
  const countBase = db
    .select({ id: properties.id })
    .from(properties)
    .innerJoin(
      roomTypes,
      and(
        eq(roomTypes.propertyId, properties.id),
        eq(roomTypes.isActive, true),
        isNull(roomTypes.deletedAt),
      ),
    )
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(where)
    .groupBy(properties.id);

  const counted = await db
    .select({ total: sql<number>`count(*)::int` })
    .from((having ? countBase.having(having) : countBase).as('matches'));

  return {
    rows: rows as SearchResultRow[],
    total: counted[0]?.total ?? 0,
    page,
    pageSize,
    institution,
  };
}

/**
 * A single live listing by slug, for the public detail page.
 *
 * Returns null for anything not live, so a paused or suspended listing 404s
 * rather than remaining reachable by its URL.
 */
export async function getPublicListing(slug: string) {
  const [row] = await db
    .select({
      id: properties.id,
      name: properties.name,
      slug: properties.slug,
      description: properties.description,
      propertyType: properties.propertyType,
      genderPolicy: properties.genderPolicy,
      // Street address is shown; the operator's phone number is not.
      addressLine1: properties.addressLine1,
      locality: properties.locality,
      city: properties.city,
      state: properties.state,
      postalCode: properties.postalCode,
      country: properties.country,
      location: properties.location,
      amenities: properties.amenities,
      houseRules: properties.houseRules,
      verificationTier: properties.verificationTier,
      verifiedAt: properties.verifiedAt,
      verificationExpiresAt: properties.verificationExpiresAt,
      publishedAt: properties.publishedAt,
      updatedAt: properties.updatedAt,
    })
    .from(properties)
    .where(
      and(
        eq(properties.slug, slug),
        eq(properties.listingState, 'live'),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const rooms = await db
    .select({
      id: roomTypes.id,
      name: roomTypes.name,
      occupancy: roomTypes.occupancy,
      hasPrivateBathroom: roomTypes.hasPrivateBathroom,
      areaSqft: roomTypes.areaSqft,
      rentAmountMinor: roomTypes.rentAmountMinor,
      rentCurrency: roomTypes.rentCurrency,
      depositAmountMinor: roomTypes.depositAmountMinor,
      minTenureMonths: roomTypes.minTenureMonths,
      amenities: roomTypes.amenities,
      bedsFree: availability.availableCount,
    })
    .from(roomTypes)
    .leftJoin(availability, eq(availability.roomTypeId, roomTypes.id))
    .where(
      and(
        eq(roomTypes.propertyId, row.id),
        eq(roomTypes.isActive, true),
        isNull(roomTypes.deletedAt),
      ),
    )
    .orderBy(asc(roomTypes.rentAmountMinor));

  return { ...row, rooms };
}

/**
 * Institutions near a listing, so a student can see how far their campus is.
 * Capped tight because a list of twenty colleges is noise.
 */
export async function nearbyInstitutions(location: LatLng | null, limit = 4) {
  if (!location) return [];

  return db
    .select({
      name: institutions.name,
      slug: institutions.slug,
      distanceMeters: sql<number>`round(ST_Distance(${institutions.location}::geography, ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography))::int`,
    })
    .from(institutions)
    .where(
      and(
        eq(institutions.isPublished, true),
        withinKm(institutions.location, location, 10),
      ),
    )
    .orderBy(
      sql`ST_Distance(${institutions.location}::geography, ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography) asc`,
    )
    .limit(limit);
}

/** Cities with live inventory, for navigation and the sitemap. */
export async function listLiveCities(): Promise<
  { city: string; listingCount: number }[]
> {
  return db
    .select({
      city: properties.city,
      listingCount: sql<number>`count(*)::int`,
    })
    .from(properties)
    .where(and(eq(properties.listingState, 'live'), isNull(properties.deletedAt)))
    .groupBy(properties.city)
    .orderBy(sql`count(*) desc`);
}

/** Published institutions, for landing pages and the sitemap. */
export async function listPublishedInstitutions() {
  return db
    .select({
      name: institutions.name,
      slug: institutions.slug,
      city: institutions.city,
      state: institutions.state,
    })
    .from(institutions)
    .where(eq(institutions.isPublished, true))
    .orderBy(asc(institutions.city), asc(institutions.name));
}

/** Slugs of every live listing, for the sitemap. */
export async function listLiveListingSlugs(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return db
    .select({ slug: properties.slug, updatedAt: properties.updatedAt })
    .from(properties)
    .where(and(eq(properties.listingState, 'live'), isNull(properties.deletedAt)))
    .orderBy(asc(properties.slug));
}

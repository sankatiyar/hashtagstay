import { describe, expect, it } from 'vitest';

import { isKnownAmenity, isKnownHouseRule } from '../../taxonomy/amenities';
import {
  BULK_PER_CAMPUS,
  MAX_CAMPUS_DISTANCE_KM,
  MIN_CAMPUS_DISTANCE_KM,
  buildBulkInventory,
  distanceKm,
} from './bulk-inventory';
import { INSTITUTIONS } from './institutions-data';

const now = new Date('2026-09-13T00:00:00Z');
const listings = buildBulkInventory(now);

describe('buildBulkInventory()', () => {
  it('generates the same number of listings around every campus', () => {
    for (const campus of INSTITUTIONS) {
      expect(listings.filter((l) => l.campusSlug === campus.slug)).toHaveLength(
        BULK_PER_CAMPUS,
      );
    }
    expect(listings).toHaveLength(BULK_PER_CAMPUS * INSTITUTIONS.length);
  });

  it('is deterministic, so re-seeding rewrites rather than reshuffles', () => {
    expect(buildBulkInventory(now)).toEqual(listings);
  });

  it('gives every listing a unique name and a slug labelled as a sample', () => {
    expect(new Set(listings.map((l) => l.name)).size).toBe(listings.length);
    const slugs = listings.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+-sample$/);
  });

  it('places each listing within reach of its campus, in the same city', () => {
    const bySlug = new Map(INSTITUTIONS.map((campus) => [campus.slug, campus]));
    for (const listing of listings) {
      const campus = bySlug.get(listing.campusSlug)!;
      const km = distanceKm(listing.lat, listing.lng, campus.lat, campus.lng);
      expect(listing.city).toBe(campus.city);
      expect(km).toBeGreaterThanOrEqual(MIN_CAMPUS_DISTANCE_KM - 0.05);
      // Inside the campus page's 5 km radius, with room for rounding.
      expect(km).toBeLessThanOrEqual(MAX_CAMPUS_DISTANCE_KM + 0.05);
    }
  });

  it('puts each listing in its own campus catchment, so campus pages do not overlap', () => {
    for (const listing of listings) {
      const nearest = [...INSTITUTIONS].sort(
        (a, b) =>
          distanceKm(listing.lat, listing.lng, a.lat, a.lng) -
          distanceKm(listing.lat, listing.lng, b.lat, b.lng),
      )[0];
      expect(nearest.slug).toBe(listing.campusSlug);
    }
  });

  it('names each listing after a locality it is actually near', () => {
    for (const listing of listings) {
      expect(listing.localityKm).toBeLessThan(3.5);
    }
  });

  it('prices rooms in whole rupees, cheaper per bed as sharing grows', () => {
    for (const listing of listings) {
      expect(listing.rooms.length).toBeGreaterThan(0);
      const byOccupancy = [...listing.rooms].sort((a, b) => a.occupancy - b.occupancy);
      for (const [i, room] of byOccupancy.entries()) {
        expect(Number.isInteger(room.rentAmountMinor)).toBe(true);
        expect(room.rentAmountMinor % 100).toBe(0);
        if (i > 0) {
          expect(room.rentAmountMinor).toBeLessThan(byOccupancy[i - 1].rentAmountMinor);
        }
      }
    }
  });

  it('keeps every verification badge unexpired at seed time', () => {
    for (const listing of listings) {
      expect(listing.verificationExpiresAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('only uses amenity and house-rule slugs the taxonomy knows', () => {
    for (const listing of listings) {
      expect(listing.amenities.filter((slug) => !isKnownAmenity(slug))).toEqual([]);
      expect(listing.houseRules.filter((slug) => !isKnownHouseRule(slug))).toEqual([]);
    }
  });
});

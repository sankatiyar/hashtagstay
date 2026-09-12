import { type SQL, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { LatLng } from '@/lib/db/schema/columns';

/**
 * Proximity-search helpers for FR-03 ("PG near VIT Vellore").
 *
 * These exist so that no call site ever writes a raw distance predicate. Point
 * columns are stored as `geometry(Point,4326)`, where distance is measured in
 * **degrees**, not metres. A query that forgets the `::geography` cast still
 * runs and still returns rows — just subtly wrong ones, over-selecting near the
 * equator and under-selecting at Delhi's latitude. That is the kind of bug that
 * ships. Always go through these helpers.
 */

/**
 * Range-check a coordinate.
 *
 * This catches transposed lat/lng only when the longitude exceeds 90° — true
 * for north-east India, but NOT for most of the country: Bengaluru's
 * (12.97, 77.59) transposes to (77.59, 12.97), which is in range and lands
 * silently in Kazakhstan. Validation cannot close that hole, which is why
 * `point()` below is the only place that orders the ST_MakePoint arguments.
 */
export function assertValidLatLng(p: LatLng): void {
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) {
    throw new Error(`Latitude out of range: ${p.lat}`);
  }
  if (!Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180) {
    throw new Error(`Longitude out of range: ${p.lng}`);
  }
}

/**
 * A 4326 point literal. Note the argument order: `ST_MakePoint` takes
 * **longitude first**. This is the single most common PostGIS mistake, which is
 * why it is written exactly once, here.
 */
export function point(p: LatLng): SQL {
  assertValidLatLng(p);
  return sql`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)`;
}

/**
 * Great-circle distance in metres between a point column and a coordinate.
 *
 * Casting both sides to `geography` is what yields metres on a spheroid.
 */
export function distanceMeters(column: PgColumn, p: LatLng): SQL<number> {
  return sql<number>`ST_Distance(${column}::geography, ${point(p)}::geography)`;
}

/**
 * `WHERE` predicate for "within N metres".
 *
 * `ST_DWithin` — not `ST_Distance(...) < n` — because only `ST_DWithin` can use
 * the GiST index. The distance form forces a full scan and puts the §9
 * sub-3-second search target out of reach as inventory grows.
 */
export function withinMeters(column: PgColumn, p: LatLng, meters: number): SQL {
  if (!Number.isFinite(meters) || meters <= 0) {
    throw new Error(`Radius must be a positive number of metres, got ${meters}`);
  }
  return sql`ST_DWithin(${column}::geography, ${point(p)}::geography, ${meters})`;
}

/** Kilometres are what users pick in the UI ("within 3 km"). */
export const withinKm = (column: PgColumn, p: LatLng, km: number): SQL =>
  withinMeters(column, p, km * 1000);

/** Read a point column back as text we can parse; PostGIS returns hex EWKB otherwise. */
export const pointAsText = (column: PgColumn): SQL<string> =>
  sql<string>`ST_AsText(${column})`;

/** Round metres to a human distance label for listing cards. */
export function formatDistance(meters: number, locale = 'en-IN'): string {
  if (meters < 1000) {
    return `${new Intl.NumberFormat(locale).format(Math.round(meters / 50) * 50)} m`;
  }
  const km = meters / 1000;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km)} km`;
}

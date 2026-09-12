import { bigint, char, geometry, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Shared column builders. Defined once so that "how we store a timestamp" or
 * "how we store money" is a single decision rather than a per-table habit.
 */

/**
 * Primary key. UUID rather than serial: ids appear in URLs and in vendor
 * payloads, and a sequential integer leaks volume to competitors.
 */
export const primaryId = () => uuid().primaryKey().defaultRandom();

/**
 * Always `timestamptz`, never `timestamp`. A naive timestamp is ambiguous the
 * moment we operate across IST and a student's origin timezone, and the PRD's
 * §9 availability target explicitly spans "supported time zones".
 */
export const tsColumn = () => timestamp({ withTimezone: true, mode: 'date' });

export const timestamps = () => ({
  createdAt: tsColumn().notNull().defaultNow(),
  updatedAt: tsColumn().notNull().defaultNow(),
});

/**
 * Soft-delete marker. Most records here are never hard-deleted: the §9
 * auditability requirement and any dispute over a booking need the row to still
 * exist. DPDP erasure is handled by anonymising personal fields, not by dropping
 * the row, so the audit trail survives without retaining personal data.
 */
export const deletedAt = () => tsColumn();

/**
 * Money is stored as two columns wherever it appears: an integer count of minor
 * units and an ISO-4217 code. Compose these explicitly per table — see
 * `lib/money` for the arithmetic rules.
 *
 * `bigint` not `integer`: gross booking value in paise for a year's rent on a
 * whole unit already exceeds a 32-bit int, and silently overflowing a revenue
 * figure is not an acceptable failure mode. `mode: 'number'` is safe because JS
 * integers are exact to 2^53 paise (about ₹90 trillion).
 */
export const amountMinor = () => bigint({ mode: 'number' });
export const currencyCode = () => char({ length: 3 });

/**
 * PostGIS point column, for university-proximity search (FR-03).
 *
 * Uses Drizzle's native `geometry` support rather than a `customType` mapping
 * to `geography`. That is a deliberate compromise:
 *
 *  - A `customType` returning `'geography(Point, 4326)'` makes drizzle-kit emit
 *    the type **quoted** (`"geography(Point, 4326)"`), which Postgres reads as
 *    an identifier for a type of that literal name — the migration fails.
 *  - `geometry({ type: 'point', srid: 4326 })` is understood by drizzle-kit and
 *    emits valid DDL plus a working GiST index.
 *
 * The consequence is that distance is measured in degrees unless you cast, so
 * **every proximity query must cast to geography** to get metres:
 *
 *   ST_DWithin(p.location::geography, ST_MakePoint($lng,$lat)::geography, $m)
 *
 * `lib/geo` wraps that so call sites can't forget the cast.
 *
 * Note the axis order: `mode: 'xy'` means `x = longitude`, `y = latitude`.
 * Swapping them silently places every property in the wrong hemisphere.
 */
export const pointColumn = () => geometry({ type: 'point', mode: 'xy', srid: 4326 });

/** Application-facing coordinate shape. Converted at the column boundary. */
export interface LatLng {
  lat: number;
  lng: number;
}

export const toPoint = (p: LatLng): { x: number; y: number } => ({
  x: p.lng,
  y: p.lat,
});

export const fromPoint = (p: { x: number; y: number }): LatLng => ({
  lng: p.x,
  lat: p.y,
});

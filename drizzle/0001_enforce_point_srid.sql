-- Enforce SRID 4326 on the PostGIS point columns.
--
-- Why this migration exists:
--   drizzle-orm's `geometry({ type: 'point', srid: 4326 })` accepts an `srid`
--   option in its TypeScript signature, but `getSQLType()` hardcodes
--   "geometry(point)" and silently discards it. The generated 0000 migration
--   therefore creates SRID-unconstrained columns, which default to SRID 0.
--
-- Why that is not survivable:
--   Proximity search (FR-03) measures metres by casting to geography:
--     ST_DWithin(location::geography, ST_MakePoint(lng,lat)::geography, radius)
--   Casting an SRID-0 geometry to geography raises
--   "Only lon/lat coordinate systems are supported in geography" — so every
--   university-proximity query would fail at runtime, not at build time.
--
-- Typing the column as geometry(Point,4326) makes Postgres reject any insert
-- carrying a different or absent SRID, which turns a silent wrong-hemisphere
-- bug into an immediate, obvious error.
--
-- Note for future schema work: `drizzle-kit generate` diffs against its own
-- snapshot rather than the live database, so this hand-written ALTER does not
-- cause drift on subsequent generates. `drizzle-kit push` DOES introspect and
-- would try to revert it — which is one more reason `npm run db:migrate` is the
-- supported path and push is for scratch databases only.

ALTER TABLE "institutions"
  ALTER COLUMN "location" TYPE geometry(Point, 4326)
  USING ST_SetSRID("location", 4326);
--> statement-breakpoint
ALTER TABLE "properties"
  ALTER COLUMN "location" TYPE geometry(Point, 4326)
  USING ST_SetSRID("location", 4326);

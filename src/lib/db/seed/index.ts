import { existsSync } from 'node:fs';

import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { INSTITUTIONS } from './institutions-data';

/**
 * Database seed. Run with `npm run db:seed`.
 *
 * Idempotent throughout: everything upserts on a natural key, so running it
 * twice is a no-op rather than a duplicate-key error or a second copy of the
 * sample data. That matters because it gets run repeatedly during development
 * and after every `db:local:reset`.
 *
 * Reference data (institutions, fee rules) seeds in every environment. Sample
 * inventory and dev logins seed **only** outside production.
 */

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. See .env.example.');
}

const isProduction = process.env.NODE_ENV === 'production';

/**
 * A public demo deployment (DEMO_MODE=true) gets sample inventory so there is
 * something to click through, but never the dev password below: it is in a
 * public repository, and on a public URL it would open the ops console to
 * anyone. Demo staff logins are only created when SEED_STAFF_PASSWORD is set.
 */
const isDemo = process.env.DEMO_MODE === 'true';

/** Dev-only password for seeded staff logins. Used only outside production. */
const DEV_PASSWORD = 'devpassword123';

function staffPassword(): { value: string; fromEnv: boolean } | null {
  const fromEnv = process.env.SEED_STAFF_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < 12) {
      throw new Error('SEED_STAFF_PASSWORD must be at least 12 characters.');
    }
    return { value: fromEnv, fromEnv: true };
  }
  return isProduction ? null : { value: DEV_PASSWORD, fromEnv: false };
}

async function seedInstitutions(db: ReturnType<typeof drizzle>) {
  let count = 0;
  for (const institution of INSTITUTIONS) {
    await db
      .insert(schema.institutions)
      .values({
        name: institution.name,
        slug: institution.slug,
        aliases: [...institution.aliases],
        city: institution.city,
        state: institution.state,
        country: 'IN',
        // Drizzle emits `point(x y)` without an SRID; PostGIS coerces it to the
        // column's declared 4326. x is longitude — see src/lib/geo.
        location: { x: institution.lng, y: institution.lat },
        isPublished: true,
      })
      .onConflictDoUpdate({
        target: schema.institutions.slug,
        set: {
          name: institution.name,
          aliases: [...institution.aliases],
          city: institution.city,
          state: institution.state,
          location: { x: institution.lng, y: institution.lat },
          isPublished: true,
          updatedAt: new Date(),
        },
      });
    count += 1;
  }
  console.log(`  institutions: ${count} upserted`);
}

/**
 * Fee rules.
 *
 * The *amounts here are placeholders*, not decisions. The PRD is explicit that
 * pricing is a commercial call for the promoter (§4, and §16 records the ~INR 99
 * figure as a historical reference from an earlier version of the model, never
 * an external fact to verify). They exist so the fee engine has something to
 * resolve in development.
 *
 * Set the real values deliberately before M4 ships, via the admin console.
 */
async function seedFeeRules(db: ReturnType<typeof drizzle>) {
  const rules = [
    {
      kind: 'facilitation_fee' as const,
      payer: 'resident' as const,
      basis: 'flat' as const,
      // PLACEHOLDER: INR 99, the PRD's historical reference point.
      flatAmountMinor: 9900,
      flatCurrency: 'INR',
      rateBps: null,
      // 18% GST on a facilitation service.
      taxRateBps: 1800,
      priority: 0,
      label: 'Default facilitation fee (PLACEHOLDER — set with promoter)',
    },
    {
      kind: 'renting_commission' as const,
      payer: 'host' as const,
      basis: 'percent_of_monthly_rent' as const,
      flatAmountMinor: null,
      flatCurrency: null,
      // PLACEHOLDER: 8% of one month's rent.
      rateBps: 800,
      taxRateBps: 1800,
      priority: 0,
      label: 'Default host commission (PLACEHOLDER — set with promoter)',
    },
  ];

  for (const rule of rules) {
    // No natural unique key on fee_rules (scope columns are nullable), so
    // match on the global default for this kind and only insert if absent.
    // Updating in place would silently rewrite a rate someone set deliberately.
    const existing = await db
      .select({ id: schema.feeRules.id })
      .from(schema.feeRules)
      .where(
        sql`${schema.feeRules.kind} = ${rule.kind}
            AND ${schema.feeRules.organizationId} IS NULL
            AND ${schema.feeRules.city} IS NULL
            AND ${schema.feeRules.propertyType} IS NULL`,
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  fee rule ${rule.kind}: already present, left untouched`);
      continue;
    }

    await db.insert(schema.feeRules).values({
      kind: rule.kind,
      payer: rule.payer,
      basis: rule.basis,
      flatAmountMinor: rule.flatAmountMinor,
      flatCurrency: rule.flatCurrency,
      rateBps: rule.rateBps,
      taxRateBps: rule.taxRateBps,
      priority: rule.priority,
    });
    console.log(`  fee rule ${rule.kind}: created (${rule.label})`);
  }
}

/** Staff logins for development and demos. */
async function seedDevStaff(
  db: ReturnType<typeof drizzle>,
  password: { value: string; fromEnv: boolean },
) {
  const passwordHash = await bcrypt.hash(password.value, 10);

  const staff = [
    { email: 'admin@hashtagstay.local', name: 'Dev Admin', roles: ['super_admin'] },
    { email: 'ops@hashtagstay.local', name: 'Dev Ops', roles: ['ops'] },
    // Separate person from ops on purpose: the separation-of-duties check in
    // lib/auth/permissions refuses to let a submitter certify their own listing,
    // so testing the verification flow needs two distinct users.
    { email: 'verifier@hashtagstay.local', name: 'Dev Verifier', roles: ['verifier'] },
    { email: 'rm@hashtagstay.local', name: 'Dev RM', roles: ['rm'] },
    { email: 'rmlead@hashtagstay.local', name: 'Dev RM Lead', roles: ['rm_lead'] },
    { email: 'finance@hashtagstay.local', name: 'Dev Finance', roles: ['finance'] },
  ] as const;

  for (const person of staff) {
    const [user] = await db
      .insert(schema.users)
      .values({
        audience: 'staff',
        email: person.email,
        emailVerifiedAt: new Date(),
        passwordHash,
        fullName: person.name,
      })
      .onConflictDoUpdate({
        target: schema.users.email,
        // `users_email_key` is a PARTIAL unique index (WHERE email IS NOT NULL),
        // which lets residents identified only by phone coexist with hosts
        // identified by email. Postgres will not match a partial index for
        // ON CONFLICT unless the predicate is restated here, so omitting
        // targetWhere fails with "no unique or exclusion constraint matching".
        targetWhere: sql`${schema.users.email} IS NOT NULL`,
        set: { fullName: person.name, passwordHash, updatedAt: new Date() },
      })
      .returning({ id: schema.users.id });

    for (const role of person.roles) {
      await db
        .insert(schema.staffRoles)
        .values({ userId: user.id, role })
        .onConflictDoNothing();
    }
  }
  console.log(
    `  staff logins: ${staff.length} upserted (password: ${password.fromEnv ? 'from SEED_STAFF_PASSWORD' : DEV_PASSWORD})`,
  );
}

/**
 * Sample inventory, so the ops console and search have something real to work
 * with. Coordinates sit near the seeded campuses to make proximity search
 * demonstrable. Skipped in production.
 */
async function seedDevInventory(db: ReturnType<typeof drizzle>) {
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: 'Nest Co-Living (Sample)',
      slug: 'nest-coliving-sample',
      legalName: 'Nest Co-Living Private Limited',
      contactEmail: 'ops@nestcoliving.local',
      contactPhone: '+919000000001',
      commissionRateBps: 800,
      verificationTier: 'documents_checked',
      verifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.organizations.slug,
      set: { name: 'Nest Co-Living (Sample)', updatedAt: new Date() },
    })
    .returning({ id: schema.organizations.id });

  const properties = [
    {
      name: 'Nest Malleswaram',
      slug: 'nest-malleswaram-sample',
      city: 'Bengaluru',
      state: 'Karnataka',
      addressLine1: '12, 8th Cross, Malleswaram',
      locality: 'Malleswaram',
      // ~1.5 km from IISc.
      lat: 13.0035,
      lng: 77.5712,
      propertyType: 'coliving' as const,
      genderPolicy: 'any' as const,
      amenities: [
        'wifi',
        'ac',
        'housekeeping',
        'laundry',
        'meals_included',
        'cctv',
        'security_24x7',
        'power_backup',
      ],
      houseRules: ['no_smoking', 'id_proof_required'],
      listingState: 'live' as const,
      verificationTier: 'onground_audited' as const,
      rooms: [
        {
          name: 'Single occupancy',
          occupancy: 1,
          rent: 1_800_000,
          deposit: 3_600_000,
          available: 3,
        },
        {
          name: 'Twin sharing',
          occupancy: 2,
          rent: 1_200_000,
          deposit: 2_400_000,
          available: 5,
        },
      ],
    },
    {
      name: 'Nest Koramangala (Women only)',
      slug: 'nest-koramangala-women-sample',
      city: 'Bengaluru',
      state: 'Karnataka',
      addressLine1: '45, 5th Block, Koramangala',
      locality: 'Koramangala',
      lat: 12.9352,
      lng: 77.6245,
      propertyType: 'coliving' as const,
      genderPolicy: 'female_only' as const,
      amenities: [
        'wifi',
        'ac',
        'housekeeping',
        'meals_included',
        'cctv',
        'security_24x7',
        'female_staff',
        'warden_on_site',
        'biometric_entry',
        'gym',
      ],
      houseRules: ['no_smoking', 'no_alcohol', 'entry_curfew', 'police_verification'],
      listingState: 'live' as const,
      verificationTier: 'onground_audited' as const,
      rooms: [
        {
          name: 'Single occupancy',
          occupancy: 1,
          rent: 2_100_000,
          deposit: 4_200_000,
          available: 2,
        },
        {
          name: 'Triple sharing',
          occupancy: 3,
          rent: 950_000,
          deposit: 1_900_000,
          available: 6,
        },
      ],
    },
    {
      name: 'Nest Kothrud Student Residence',
      slug: 'nest-kothrud-sample',
      city: 'Pune',
      state: 'Maharashtra',
      addressLine1: '7, Paud Road, Kothrud',
      locality: 'Kothrud',
      // Near MIT-WPU.
      lat: 18.4988,
      lng: 73.8135,
      propertyType: 'pbsa' as const,
      genderPolicy: 'co_ed_segregated_floors' as const,
      amenities: [
        'wifi',
        'study_desk',
        'meals_included',
        'laundry',
        'cctv',
        'security_24x7',
        'power_backup',
        'coworking',
      ],
      houseRules: ['no_smoking', 'no_alcohol', 'min_tenure_applies'],
      listingState: 'live' as const,
      verificationTier: 'photos_verified' as const,
      rooms: [
        {
          name: 'Twin sharing',
          occupancy: 2,
          rent: 1_050_000,
          deposit: 1_050_000,
          available: 8,
        },
      ],
    },
    {
      name: 'Nest Mukherjee Nagar',
      slug: 'nest-mukherjee-nagar-sample',
      city: 'Delhi NCR',
      state: 'Delhi',
      addressLine1: '221, Mukherjee Nagar',
      locality: 'Mukherjee Nagar',
      // ~2.5 km from DU North Campus.
      lat: 28.7075,
      lng: 77.2098,
      propertyType: 'homeshare' as const,
      genderPolicy: 'male_only' as const,
      amenities: ['wifi', 'study_desk', 'kitchen_access', 'power_backup', 'cctv'],
      houseRules: ['no_smoking', 'id_proof_required'],
      // Deliberately not live: gives the ops console and the verification queue
      // something in flight to work with.
      listingState: 'in_verification' as const,
      verificationTier: 'none' as const,
      rooms: [
        {
          name: 'Single room',
          occupancy: 1,
          rent: 1_400_000,
          deposit: 1_400_000,
          available: 1,
        },
      ],
    },
  ];

  for (const property of properties) {
    const [row] = await db
      .insert(schema.properties)
      .values({
        organizationId: org.id,
        name: property.name,
        slug: property.slug,
        description: `${property.name} — sample inventory seeded for development.`,
        propertyType: property.propertyType,
        genderPolicy: property.genderPolicy,
        addressLine1: property.addressLine1,
        locality: property.locality,
        city: property.city,
        state: property.state,
        country: 'IN',
        location: { x: property.lng, y: property.lat },
        amenities: property.amenities,
        houseRules: property.houseRules,
        listingState: property.listingState,
        publishedAt: property.listingState === 'live' ? new Date() : null,
        verificationTier: property.verificationTier,
        verifiedAt: property.verificationTier === 'none' ? null : new Date(),
        lastReviewedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.properties.slug,
        set: {
          name: property.name,
          location: { x: property.lng, y: property.lat },
          amenities: property.amenities,
          listingState: property.listingState,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.properties.id });

    // Room types have no natural unique key, so replace them wholesale rather
    // than accumulating duplicates across runs.
    await db.delete(schema.roomTypes).where(eq(schema.roomTypes.propertyId, row.id));

    for (const room of property.rooms) {
      const [roomRow] = await db
        .insert(schema.roomTypes)
        .values({
          propertyId: row.id,
          name: room.name,
          occupancy: room.occupancy,
          hasPrivateBathroom: room.occupancy === 1,
          rentAmountMinor: room.rent,
          rentCurrency: 'INR',
          depositAmountMinor: room.deposit,
          depositCurrency: 'INR',
          minTenureMonths: property.propertyType === 'pbsa' ? 11 : 3,
          amenities: [],
        })
        .returning({ id: schema.roomTypes.id });

      await db.insert(schema.availability).values({
        roomTypeId: roomRow.id,
        availableCount: room.available,
        availableFrom: new Date(),
        // Seeded data is an import, which is the least trustworthy provenance —
        // the ops queue should treat it as needing confirmation.
        source: 'import',
        lastConfirmedAt: new Date(),
        notes: 'Seeded sample data; not confirmed with the operator.',
      });
    }
  }

  console.log(`  dev inventory: 1 operator, ${properties.length} properties`);
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  try {
    console.log('Seeding reference data...');
    await seedInstitutions(db);
    await seedFeeRules(db);

    if (isProduction && !isDemo) {
      console.log('\nNODE_ENV=production — skipping dev staff and sample inventory.');
    } else {
      console.log(isDemo ? '\nSeeding demo data...' : '\nSeeding development data...');
      const password = staffPassword();
      if (password) {
        await seedDevStaff(db, password);
      } else {
        console.log('  staff logins: skipped (set SEED_STAFF_PASSWORD to create them)');
      }
      await seedDevInventory(db);
    }

    console.log('\nSeed complete.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('\nSeed failed:');
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

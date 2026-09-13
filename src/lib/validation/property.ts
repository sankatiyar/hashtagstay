import { z } from 'zod';

import { MoneyError, fromMajorUnits } from '@/lib/money';
import { isKnownAmenity, isKnownHouseRule } from '@/lib/taxonomy/amenities';

/**
 * Property input validation.
 *
 * Shared by the form and the service so the two cannot disagree about what is
 * acceptable. Errors are written to be read by an ops user mid-task, not by a
 * developer reading a stack trace.
 *
 * Money arrives as a major-unit string because that is what a person types
 * ("8500", "8500.50"). It is converted through `lib/money`, which refuses to
 * round away excess precision rather than silently accepting it.
 */

const trimmed = z.string().trim();

/** Rent and deposit, typed in rupees, stored as paise. */
const majorAmount = (label: string, { required }: { required: boolean }) =>
  trimmed
    .transform((v) => v.replace(/[,\s₹]/g, ''))
    .superRefine((value, ctx) => {
      if (value === '') {
        if (required) {
          ctx.addIssue({ code: 'custom', message: `${label} is required.` });
        }
        return;
      }
      try {
        const money = fromMajorUnits(value, 'INR');
        if (money.amountMinor < 0) {
          ctx.addIssue({ code: 'custom', message: `${label} cannot be negative.` });
        }
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message:
            error instanceof MoneyError
              ? `${label}: ${error.message}`
              : `${label} is not a valid amount.`,
        });
      }
    })
    .transform((value) =>
      value === '' ? null : fromMajorUnits(value, 'INR').amountMinor,
    );

/**
 * Latitude and longitude.
 *
 * Bounded to India's envelope rather than the whole globe. Phase 1 is
 * India-only, and the overwhelmingly common error is transposed coordinates —
 * which a global ±90/±180 check cannot catch for most Indian cities, but a
 * country bound catches immediately. Widen this when international inventory
 * lands (FR-05), do not remove it.
 */
const INDIA_BOUNDS = { minLat: 6, maxLat: 37.5, minLng: 68, maxLng: 97.5 };

const coordinate = trimmed.optional().transform((v) => (v === '' ? undefined : v));

export const propertyTypeSchema = z.enum(['pbsa', 'coliving', 'homeshare']);
export const genderPolicySchema = z.enum([
  'any',
  'male_only',
  'female_only',
  'co_ed_segregated_floors',
]);

export const roomTypeInputSchema = z.object({
  name: trimmed.min(1, 'Give the room type a name, e.g. "Single occupancy".').max(120),
  occupancy: z.coerce
    .number()
    .int('Occupancy must be a whole number of beds.')
    .min(1, 'Occupancy must be at least 1.')
    .max(12, 'Occupancy above 12 is almost certainly a typo.'),
  hasPrivateBathroom: z.coerce.boolean().default(false),
  rentAmountMinor: majorAmount('Monthly rent', { required: true }),
  depositAmountMinor: majorAmount('Deposit', { required: false }),
  minTenureMonths: z.coerce
    .number()
    .int('Minimum tenure must be a whole number of months.')
    .min(1, 'Minimum tenure must be at least 1 month.')
    .max(36, 'Minimum tenure above 36 months is almost certainly a typo.')
    .default(1),
});

export const createPropertySchema = z
  .object({
    organizationId: z.uuid('Choose which operator this property belongs to.'),

    name: trimmed
      .min(3, 'Give the property a name of at least 3 characters.')
      .max(200, 'Keep the name under 200 characters.'),
    /** Optional: derived from the name when blank. */
    slug: trimmed
      .optional()
      .transform((v) => (v === '' ? undefined : v))
      .refine(
        (v) => v === undefined || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
        'A slug may only contain lowercase letters, numbers and single hyphens.',
      ),
    description: trimmed.max(4000).optional(),

    propertyType: propertyTypeSchema,
    genderPolicy: genderPolicySchema.default('any'),

    addressLine1: trimmed.min(3, 'Enter the street address.').max(250),
    addressLine2: trimmed.max(250).optional(),
    locality: trimmed.max(120).optional(),
    city: trimmed.min(2, 'Enter the city.').max(120),
    state: trimmed.max(120).optional(),
    postalCode: trimmed
      .optional()
      .transform((v) => (v === '' ? undefined : v))
      .refine(
        (v) => v === undefined || /^[1-9][0-9]{5}$/.test(v),
        'An Indian PIN code is 6 digits and does not start with 0.',
      ),

    latitude: coordinate,
    longitude: coordinate,

    amenities: z
      .array(z.string())
      .default([])
      .refine((list) => list.every(isKnownAmenity), {
        message: 'An unrecognised amenity was submitted.',
      }),
    houseRules: z
      .array(z.string())
      .default([])
      .refine((list) => list.every(isKnownHouseRule), {
        message: 'An unrecognised house rule was submitted.',
      }),

    rooms: z
      .array(roomTypeInputSchema)
      .min(1, 'Add at least one room type — a property cannot be listed without one.')
      .max(20, 'Add at most 20 room types.'),
  })
  .superRefine((value, ctx) => {
    const hasLat = value.latitude !== undefined;
    const hasLng = value.longitude !== undefined;

    // Both or neither. One alone is unusable and silently excludes the property
    // from proximity search while looking like it was filled in.
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: 'custom',
        path: [hasLat ? 'longitude' : 'latitude'],
        message: 'Enter both latitude and longitude, or leave both blank.',
      });
      return;
    }
    if (!hasLat) return;

    const lat = Number(value.latitude);
    const lng = Number(value.longitude);

    if (!Number.isFinite(lat)) {
      ctx.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Latitude must be a number.',
      });
      return;
    }
    if (!Number.isFinite(lng)) {
      ctx.addIssue({
        code: 'custom',
        path: ['longitude'],
        message: 'Longitude must be a number.',
      });
      return;
    }

    if (lat < INDIA_BOUNDS.minLat || lat > INDIA_BOUNDS.maxLat) {
      ctx.addIssue({
        code: 'custom',
        path: ['latitude'],
        message:
          `Latitude ${lat} is outside India. If you pasted "lng, lat", swap them — ` +
          'longitude comes second here.',
      });
    }
    if (lng < INDIA_BOUNDS.minLng || lng > INDIA_BOUNDS.maxLng) {
      ctx.addIssue({
        code: 'custom',
        path: ['longitude'],
        message:
          `Longitude ${lng} is outside India. If you pasted "lng, lat", swap them — ` +
          'latitude comes first here.',
      });
    }
  });

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type RoomTypeInput = z.infer<typeof roomTypeInputSchema>;

/**
 * Build the schema's input shape from a submitted form.
 *
 * Room types arrive as parallel indexed fields (`rooms.0.name`, `rooms.1.name`)
 * because HTML forms have no nesting. Rows are collected until a gap, then
 * blank rows are dropped so a partially-filled extra row is ignored rather than
 * failing validation.
 */
export function parsePropertyForm(formData: FormData) {
  const rooms: Record<string, string>[] = [];

  for (let index = 0; index < 20; index += 1) {
    const name = formData.get(`rooms.${index}.name`);
    const rent = formData.get(`rooms.${index}.rentAmountMinor`);
    if (name === null && rent === null) continue;

    const row = {
      name: String(name ?? '').trim(),
      occupancy: String(formData.get(`rooms.${index}.occupancy`) ?? '1'),
      hasPrivateBathroom:
        formData.get(`rooms.${index}.hasPrivateBathroom`) === 'on' ? 'true' : '',
      rentAmountMinor: String(rent ?? '').trim(),
      depositAmountMinor: String(
        formData.get(`rooms.${index}.depositAmountMinor`) ?? '',
      ).trim(),
      minTenureMonths: String(formData.get(`rooms.${index}.minTenureMonths`) ?? '1'),
    };

    // A row the user never touched is not an error.
    if (row.name === '' && row.rentAmountMinor === '') continue;
    rooms.push(row);
  }

  return {
    organizationId: String(formData.get('organizationId') ?? ''),
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    description: String(formData.get('description') ?? ''),
    propertyType: String(formData.get('propertyType') ?? ''),
    genderPolicy: String(formData.get('genderPolicy') ?? 'any'),
    addressLine1: String(formData.get('addressLine1') ?? ''),
    addressLine2: String(formData.get('addressLine2') ?? ''),
    locality: String(formData.get('locality') ?? ''),
    city: String(formData.get('city') ?? ''),
    state: String(formData.get('state') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    latitude: String(formData.get('latitude') ?? ''),
    longitude: String(formData.get('longitude') ?? ''),
    amenities: formData.getAll('amenities').map(String),
    houseRules: formData.getAll('houseRules').map(String),
    rooms,
  };
}

/** Flatten zod issues into `{ fieldPath: message }` for rendering beside inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    // Keep the first message per field; a stack of three on one input is noise.
    out[key] ??= issue.message;
  }
  return out;
}

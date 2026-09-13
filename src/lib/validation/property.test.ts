import { describe, expect, it } from 'vitest';

import { createPropertySchema, fieldErrors, parsePropertyForm } from './property';

/**
 * A genuine v4 UUID. `z.uuid()` in zod 4 enforces the RFC version and variant
 * nibbles, so a lazy fixture like `1111-1111-...` is rejected — the 13th
 * character must be the version and the 17th must be 8, 9, a or b. Postgres
 * `gen_random_uuid()` emits v4, so the strict check is the right one to keep.
 */
const ORG = '3f1a9c2e-7b4d-4e8a-9c1f-2a5b7d3e6f80';

function base(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    name: 'Nest Malleswaram',
    slug: '',
    description: '',
    propertyType: 'coliving',
    genderPolicy: 'any',
    addressLine1: '12, 8th Cross',
    addressLine2: '',
    locality: 'Malleswaram',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '',
    latitude: '',
    longitude: '',
    amenities: [] as string[],
    houseRules: [] as string[],
    rooms: [
      {
        name: 'Single occupancy',
        occupancy: '1',
        hasPrivateBathroom: '',
        rentAmountMinor: '18000',
        depositAmountMinor: '',
        minTenureMonths: '3',
      },
    ],
    ...overrides,
  };
}

const parse = (input: Record<string, unknown>) => createPropertySchema.safeParse(input);

describe('createPropertySchema', () => {
  it('accepts a minimal valid property', () => {
    const result = parse(base());
    expect(result.success).toBe(true);
  });

  it('converts rupees to paise', () => {
    const result = parse(base());
    expect(result.success && result.data.rooms[0].rentAmountMinor).toBe(1_800_000);
  });

  it('tolerates commas, spaces and a rupee sign in an amount', () => {
    // Ops will paste "₹18,000" from an operator's email.
    const result = parse(
      base({
        rooms: [{ ...base().rooms[0], rentAmountMinor: '₹18,000' }],
      }),
    );
    expect(result.success && result.data.rooms[0].rentAmountMinor).toBe(1_800_000);
  });

  it('accepts paise precision', () => {
    const result = parse(
      base({ rooms: [{ ...base().rooms[0], rentAmountMinor: '18000.50' }] }),
    );
    expect(result.success && result.data.rooms[0].rentAmountMinor).toBe(1_800_050);
  });

  it('refuses to round away excess precision rather than accepting it', () => {
    const result = parse(
      base({ rooms: [{ ...base().rooms[0], rentAmountMinor: '18000.555' }] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)['rooms.0.rentAmountMinor']).toMatch(
        /Refusing to round/,
      );
    }
  });

  it('requires rent but allows a blank deposit', () => {
    const missingRent = parse(
      base({ rooms: [{ ...base().rooms[0], rentAmountMinor: '' }] }),
    );
    expect(missingRent.success).toBe(false);

    const noDeposit = parse(base());
    expect(noDeposit.success && noDeposit.data.rooms[0].depositAmountMinor).toBeNull();
  });

  it('requires at least one room type', () => {
    const result = parse(base({ rooms: [] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).rooms).toMatch(/at least one room type/);
    }
  });

  it('rejects a name that is too short', () => {
    expect(parse(base({ name: 'X' })).success).toBe(false);
  });

  it('rejects a non-uuid operator', () => {
    const result = parse(base({ organizationId: 'not-a-uuid' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).organizationId).toMatch(/Choose which operator/);
    }
  });

  it('rejects an unknown amenity slug', () => {
    const result = parse(base({ amenities: ['wifi', 'teleporter'] }));
    expect(result.success).toBe(false);
  });

  it('accepts known amenity and rule slugs', () => {
    const result = parse(
      base({ amenities: ['wifi', 'cctv'], houseRules: ['no_smoking'] }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a malformed slug but accepts a well-formed one', () => {
    expect(parse(base({ slug: 'Nest Malleswaram' })).success).toBe(false);
    expect(parse(base({ slug: 'nest-malleswaram' })).success).toBe(true);
  });

  it('validates an Indian PIN code', () => {
    expect(parse(base({ postalCode: '560003' })).success).toBe(true);
    expect(parse(base({ postalCode: '060003' })).success).toBe(false);
    expect(parse(base({ postalCode: '56003' })).success).toBe(false);
  });
});

describe('coordinate validation', () => {
  it('accepts a real Bengaluru coordinate', () => {
    const result = parse(base({ latitude: '13.0035', longitude: '77.5712' }));
    expect(result.success).toBe(true);
  });

  it('accepts both blank', () => {
    expect(parse(base({ latitude: '', longitude: '' })).success).toBe(true);
  });

  it('rejects one without the other', () => {
    // One alone is unusable and silently excludes the property from proximity
    // search while looking filled in.
    const result = parse(base({ latitude: '13.0035', longitude: '' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).longitude).toMatch(
        /both latitude and longitude/,
      );
    }
  });

  it('catches transposed Bengaluru coordinates — the case a global check misses', () => {
    // 12.97/77.59 swapped is still within ±90/±180, so only a country bound
    // catches it. Untrapped, the property lands in Kazakhstan.
    const result = parse(base({ latitude: '77.5712', longitude: '13.0035' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.latitude).toMatch(/outside India/);
      expect(errors.latitude).toMatch(/swap them/);
    }
  });

  it('rejects a non-numeric coordinate', () => {
    expect(parse(base({ latitude: 'abc', longitude: '77.5' })).success).toBe(false);
  });

  it('accepts the corners of the Indian envelope', () => {
    expect(parse(base({ latitude: '8.1', longitude: '77.5' })).success).toBe(true); // Kanyakumari
    expect(parse(base({ latitude: '34.1', longitude: '74.8' })).success).toBe(true); // Srinagar
    expect(parse(base({ latitude: '26.1', longitude: '91.7' })).success).toBe(true); // Guwahati
  });
});

describe('parsePropertyForm()', () => {
  function formOf(entries: [string, string][]): FormData {
    const fd = new FormData();
    for (const [key, value] of entries) fd.append(key, value);
    return fd;
  }

  it('collects indexed room rows into an array', () => {
    const parsed = parsePropertyForm(
      formOf([
        ['name', 'Nest'],
        ['rooms.0.name', 'Single'],
        ['rooms.0.rentAmountMinor', '18000'],
        ['rooms.1.name', 'Twin'],
        ['rooms.1.rentAmountMinor', '12000'],
      ]),
    );
    expect(parsed.rooms).toHaveLength(2);
    expect(parsed.rooms[1].name).toBe('Twin');
  });

  it('drops a room row the user never filled in', () => {
    // An extra blank row from "Add another room type" must not fail the form.
    const parsed = parsePropertyForm(
      formOf([
        ['rooms.0.name', 'Single'],
        ['rooms.0.rentAmountMinor', '18000'],
        ['rooms.1.name', ''],
        ['rooms.1.rentAmountMinor', ''],
      ]),
    );
    expect(parsed.rooms).toHaveLength(1);
  });

  it('collects repeated checkbox values', () => {
    const parsed = parsePropertyForm(
      formOf([
        ['amenities', 'wifi'],
        ['amenities', 'cctv'],
        ['houseRules', 'no_smoking'],
      ]),
    );
    expect(parsed.amenities).toEqual(['wifi', 'cctv']);
    expect(parsed.houseRules).toEqual(['no_smoking']);
  });

  it('maps an unchecked checkbox to false rather than omitting it', () => {
    const parsed = parsePropertyForm(
      formOf([
        ['rooms.0.name', 'Single'],
        ['rooms.0.rentAmountMinor', '18000'],
      ]),
    );
    expect(parsed.rooms[0].hasPrivateBathroom).toBe('');
  });

  it('reads a checked checkbox as on', () => {
    const parsed = parsePropertyForm(
      formOf([
        ['rooms.0.name', 'Single'],
        ['rooms.0.rentAmountMinor', '18000'],
        ['rooms.0.hasPrivateBathroom', 'on'],
      ]),
    );
    expect(parsed.rooms[0].hasPrivateBathroom).toBe('true');
  });

  it('survives an entirely empty submission without throwing', () => {
    const parsed = parsePropertyForm(new FormData());
    expect(parsed.rooms).toEqual([]);
    expect(parse(parsed).success).toBe(false);
  });
});

describe('fieldErrors()', () => {
  it('keys messages by field path and keeps the first per field', () => {
    const result = parse(base({ name: 'X', city: '' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.name).toBeTruthy();
      expect(errors.city).toBeTruthy();
    }
  });

  it('uses nested paths for room fields', () => {
    const result = parse(base({ rooms: [{ ...base().rooms[0], occupancy: '0' }] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)['rooms.0.occupancy']).toMatch(/at least 1/);
    }
  });
});

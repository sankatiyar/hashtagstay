import { describe, expect, it } from 'vitest';

import { ageInDays, ageInDaysOrNull, isExpired, isoDate } from './time';

const NOW = new Date('2026-09-12T12:00:00.000Z');

describe('ageInDays()', () => {
  it('returns 0 for earlier the same day', () => {
    expect(ageInDays(new Date('2026-09-12T01:00:00.000Z'), NOW)).toBe(0);
  });

  it('counts whole elapsed days, not calendar boundaries', () => {
    // 23 hours earlier is still under one full day.
    expect(ageInDays(new Date('2026-09-11T13:00:00.000Z'), NOW)).toBe(0);
    expect(ageInDays(new Date('2026-09-11T11:00:00.000Z'), NOW)).toBe(1);
  });

  it('handles a two-week gap', () => {
    expect(ageInDays(new Date('2026-08-29T12:00:00.000Z'), NOW)).toBe(14);
  });

  it('returns negative for a future date', () => {
    expect(ageInDays(new Date('2026-09-20T12:00:00.000Z'), NOW)).toBe(-8);
  });
});

describe('ageInDaysOrNull()', () => {
  it('maps null and undefined to null rather than to 0', () => {
    // Returning 0 would render "confirmed today" for inventory never confirmed
    // at all — the exact opposite of the truth.
    expect(ageInDaysOrNull(null, NOW)).toBeNull();
    expect(ageInDaysOrNull(undefined, NOW)).toBeNull();
  });

  it('accepts an ISO string, as returned by a raw SQL aggregate', () => {
    expect(ageInDaysOrNull('2026-09-05T12:00:00.000Z', NOW)).toBe(7);
  });

  it('maps an unparseable value to null', () => {
    expect(ageInDaysOrNull('not a date', NOW)).toBeNull();
  });
});

describe('isExpired()', () => {
  it('is true for a past date', () => {
    expect(isExpired(new Date('2026-09-11T12:00:00.000Z'), NOW)).toBe(true);
  });

  it('is false for a future date', () => {
    expect(isExpired(new Date('2027-01-01T00:00:00.000Z'), NOW)).toBe(false);
  });

  it('treats no expiry date as not expired', () => {
    // A verification with no recorded expiry is open-ended, not lapsed.
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
  });

  it('treats an unparseable value as not expired rather than throwing', () => {
    expect(isExpired('garbage', NOW)).toBe(false);
  });
});

describe('isoDate()', () => {
  it('formats to YYYY-MM-DD', () => {
    expect(isoDate(new Date('2026-09-12T23:45:00.000Z'))).toBe('2026-09-12');
  });

  it('returns null for absent or invalid input', () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate('nope')).toBeNull();
  });
});

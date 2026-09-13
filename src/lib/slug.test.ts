import { describe, expect, it } from 'vitest';

import { isValidSlug, slugify, slugifyOrThrow, uniqueSlug } from './slug';

describe('slugify()', () => {
  it('handles an ordinary property name', () => {
    expect(slugify('Nest Malleswaram')).toBe('nest-malleswaram');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Nest Koramangala (Women only)')).toBe(
      'nest-koramangala-women-only',
    );
  });

  it('keeps the base letter when removing accents', () => {
    // NFD + mark removal, not a blunt strip: "caf" would be wrong.
    expect(slugify('Café Residency')).toBe('cafe-residency');
  });

  it('expands characters that would otherwise be lost', () => {
    expect(slugify('Rooms & Beds')).toBe('rooms-and-beds');
    expect(slugify('Stay @ Koramangala')).toBe('stay-at-koramangala');
    expect(slugify('50% off')).toBe('50-pc-off');
  });

  it('handles Indian place names with dots and hyphens', () => {
    expect(slugify('R.V. College PG')).toBe('r-v-college-pg');
    expect(slugify('Sector 62, Noida')).toBe('sector-62-noida');
    expect(slugify("St. Mark's Road")).toBe('st-mark-s-road');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  --Nest--  ')).toBe('nest');
  });

  it('collapses runs of separators', () => {
    expect(slugify('Nest   ///   Pune')).toBe('nest-pune');
  });

  it('caps length without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns empty when nothing usable survives', () => {
    // The caller must handle this rather than publishing a blank URL.
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('returns empty for a name with no Latin characters', () => {
    // Deliberate: a guessed transliteration is worse than asking ops to choose.
    expect(slugify('नेस्ट')).toBe('');
  });
});

describe('slugifyOrThrow()', () => {
  it('returns a slug when one can be derived', () => {
    expect(slugifyOrThrow('Nest Pune')).toBe('nest-pune');
  });

  it('throws with an actionable message when it cannot', () => {
    expect(() => slugifyOrThrow('!!!')).toThrow(/Provide one explicitly/);
  });
});

describe('isValidSlug()', () => {
  it('accepts well-formed slugs', () => {
    expect(isValidSlug('nest-malleswaram')).toBe(true);
    expect(isValidSlug('sector-62-noida')).toBe(true);
    expect(isValidSlug('nest')).toBe(true);
  });

  it('rejects malformed slugs', () => {
    expect(isValidSlug('Nest-Malleswaram')).toBe(false); // uppercase
    expect(isValidSlug('nest--malleswaram')).toBe(false); // double hyphen
    expect(isValidSlug('-nest')).toBe(false);
    expect(isValidSlug('nest-')).toBe(false);
    expect(isValidSlug('nest malleswaram')).toBe(false); // space
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a'.repeat(101))).toBe(false);
  });
});

describe('uniqueSlug()', () => {
  it('returns the base when it is free', () => {
    expect(uniqueSlug('nest-pune', [])).toBe('nest-pune');
  });

  it('starts suffixing at 2, since there is no "-1"', () => {
    expect(uniqueSlug('nest-pune', ['nest-pune'])).toBe('nest-pune-2');
  });

  it('skips over taken suffixes', () => {
    expect(uniqueSlug('nest-pune', ['nest-pune', 'nest-pune-2', 'nest-pune-3'])).toBe(
      'nest-pune-4',
    );
  });

  it('is unaffected by unrelated slugs', () => {
    expect(uniqueSlug('nest-pune', ['nest-delhi', 'other'])).toBe('nest-pune');
  });
});

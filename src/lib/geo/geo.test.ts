import { describe, expect, it } from 'vitest';

import { assertValidLatLng, formatDistance } from './index';

// Bengaluru — a realistic anchor-city coordinate.
const BLR = { lat: 12.9716, lng: 77.5946 };

describe('assertValidLatLng()', () => {
  it('accepts a real coordinate', () => {
    expect(() => assertValidLatLng(BLR)).not.toThrow();
  });

  it('catches transposition when longitude exceeds 90 — e.g. Guwahati', () => {
    // Guwahati is 26.14 N, 91.74 E. Swapped, the latitude becomes 91.74, which
    // is out of range and therefore caught.
    expect(() => assertValidLatLng({ lat: 91.74, lng: 26.14 })).toThrow(
      /Latitude out of range/,
    );
  });

  it('CANNOT catch transposition when both values are valid latitudes', () => {
    // Bengaluru is 12.97 N, 77.59 E. Swapped, both numbers are still in range,
    // so a range check passes and the point silently lands in Kazakhstan.
    //
    // This is the documented limitation, and precisely why `point()` is the
    // only place in the codebase that orders the ST_MakePoint arguments:
    // validation cannot save us here, so there is exactly one line to get right.
    expect(() => assertValidLatLng({ lat: BLR.lng, lng: BLR.lat })).not.toThrow();
  });

  it('rejects a longitude outside ±180', () => {
    expect(() => assertValidLatLng({ lat: 12.9, lng: 200 })).toThrow(
      /Longitude out of range/,
    );
  });

  it('rejects NaN rather than passing it to PostGIS', () => {
    expect(() => assertValidLatLng({ lat: Number.NaN, lng: 77 })).toThrow();
  });

  it('accepts the extremes', () => {
    expect(() => assertValidLatLng({ lat: -90, lng: -180 })).not.toThrow();
    expect(() => assertValidLatLng({ lat: 90, lng: 180 })).not.toThrow();
  });
});

describe('formatDistance()', () => {
  it('snaps sub-kilometre distances to 50 m so cards do not imply false precision', () => {
    expect(formatDistance(340)).toBe('350 m');
    expect(formatDistance(120)).toBe('100 m');
  });

  it('shows one decimal under 10 km', () => {
    expect(formatDistance(2400)).toBe('2.4 km');
  });

  it('drops the decimal at 10 km and above', () => {
    expect(formatDistance(12_400)).toBe('12 km');
  });
});

import { describe, expect, it } from 'vitest';

import {
  formatPhone,
  maskPhone,
  normalizeIndianMobile,
  requireIndianMobile,
} from './phone';

describe('normalizeIndianMobile()', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['98765-43210', '+919876543210'],
    ['(+91) 98765 43210', '+919876543210'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each([
    ['5876543210', 'starts below 6'],
    ['987654321', 'too short'],
    ['98765432101', 'too long'],
    ['+449876543210', 'non-Indian country code'],
    ['', 'empty'],
    ['not a number', 'junk'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });

  it('treats the same person identically however they typed it', () => {
    const forms = ['9876543210', '+91 98765 43210', '09876543210'];
    expect(new Set(forms.map(normalizeIndianMobile)).size).toBe(1);
  });
});

describe('requireIndianMobile()', () => {
  it('throws a user-facing message', () => {
    expect(() => requireIndianMobile('123')).toThrow(/10-digit Indian mobile/);
  });
});

describe('display helpers', () => {
  it('masks the middle digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98••• ••210');
  });

  it('formats readably', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
  });

  it('handles absence', () => {
    expect(maskPhone(null)).toBe('—');
    expect(formatPhone(undefined)).toBe('—');
  });
});

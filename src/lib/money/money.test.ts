import { describe, expect, it } from 'vitest';

import {
  MoneyError,
  add,
  allocate,
  allocateByRatios,
  compare,
  format,
  fromColumns,
  fromMajorUnits,
  money,
  multiplyByInteger,
  multiplyByRate,
  subtract,
  sum,
  toRazorpayAmount,
} from './index';

describe('money()', () => {
  it('accepts integer minor units', () => {
    expect(money(850_000, 'INR')).toEqual({ amountMinor: 850_000, currency: 'INR' });
  });

  it('rejects fractional minor units — a float leaked in upstream', () => {
    expect(() => money(99.5, 'INR')).toThrow(MoneyError);
  });

  it('rejects unsupported currencies', () => {
    // @ts-expect-error deliberately invalid
    expect(() => money(100, 'XYZ')).toThrow(MoneyError);
  });
});

describe('fromMajorUnits()', () => {
  it('converts whole rupees', () => {
    expect(fromMajorUnits(8500, 'INR').amountMinor).toBe(850_000);
  });

  it('converts a 2dp decimal string', () => {
    expect(fromMajorUnits('8500.75', 'INR').amountMinor).toBe(850_075);
  });

  it('pads a 1dp decimal', () => {
    expect(fromMajorUnits('99.5', 'INR').amountMinor).toBe(9950);
  });

  it('handles negatives (refunds, statement adjustments)', () => {
    expect(fromMajorUnits('-250.50', 'INR').amountMinor).toBe(-25_050);
  });

  it('refuses to silently round excess precision', () => {
    expect(() => fromMajorUnits('99.999', 'INR')).toThrow(/Refusing to round/);
  });

  it('rejects junk input', () => {
    expect(() => fromMajorUnits('8,500', 'INR')).toThrow(MoneyError);
    expect(() => fromMajorUnits('abc', 'INR')).toThrow(MoneyError);
    expect(() => fromMajorUnits('', 'INR')).toThrow(MoneyError);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(add(money(100, 'INR'), money(250, 'INR')).amountMinor).toBe(350);
    expect(subtract(money(250, 'INR'), money(100, 'INR')).amountMinor).toBe(150);
  });

  it('refuses cross-currency arithmetic rather than guessing an FX rate', () => {
    expect(() => add(money(100, 'INR'), money(100, 'USD'))).toThrow(/Cross-currency/);
  });

  it('sums an empty list to zero in the stated currency', () => {
    expect(sum([], 'INR')).toEqual({ amountMinor: 0, currency: 'INR' });
  });

  it('multiplies by an integer exactly — 3 months of rent', () => {
    expect(multiplyByInteger(fromMajorUnits(8500, 'INR'), 3).amountMinor).toBe(
      2_550_000,
    );
  });

  it('compares', () => {
    expect(compare(money(1, 'INR'), money(2, 'INR'))).toBe(-1);
    expect(compare(money(2, 'INR'), money(2, 'INR'))).toBe(0);
    expect(compare(money(3, 'INR'), money(2, 'INR'))).toBe(1);
  });
});

describe('multiplyByRate()', () => {
  it('computes an 8% commission on ₹8,500', () => {
    // 850000 * 0.08 = 68000 paise = ₹680
    expect(multiplyByRate(fromMajorUnits(8500, 'INR'), 0.08).amountMinor).toBe(68_000);
  });

  it('computes 18% GST on a ₹99 fee', () => {
    // 9900 * 0.18 = 1782 paise = ₹17.82
    expect(multiplyByRate(fromMajorUnits(99, 'INR'), 0.18).amountMinor).toBe(1782);
  });

  it('uses banker’s rounding by default to avoid upward bias at scale', () => {
    // 2.5 -> 2 (nearest even), not 3
    expect(multiplyByRate(money(5, 'INR'), 0.5).amountMinor).toBe(2);
    // 3.5 -> 4 (nearest even)
    expect(multiplyByRate(money(7, 'INR'), 0.5).amountMinor).toBe(4);
  });

  it('honours an explicit rounding mode', () => {
    expect(multiplyByRate(money(5, 'INR'), 0.5, 'half-up').amountMinor).toBe(3);
    expect(multiplyByRate(money(5, 'INR'), 0.5, 'down').amountMinor).toBe(2);
    expect(multiplyByRate(money(5, 'INR'), 0.5, 'up').amountMinor).toBe(3);
  });

  it('rounds negatives away from zero for "up", toward zero for "down"', () => {
    expect(multiplyByRate(money(-5, 'INR'), 0.5, 'up').amountMinor).toBe(-3);
    expect(multiplyByRate(money(-5, 'INR'), 0.5, 'down').amountMinor).toBe(-2);
  });
});

describe('allocate()', () => {
  it('never loses or invents a minor unit', () => {
    const parts = allocate(money(100, 'INR'), 3);
    expect(parts.map((p) => p.amountMinor)).toEqual([34, 33, 33]);
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(100);
  });

  it('splits evenly when it divides cleanly', () => {
    expect(allocate(money(99, 'INR'), 3).map((p) => p.amountMinor)).toEqual([
      33, 33, 33,
    ]);
  });

  it('handles negative totals without drift', () => {
    const parts = allocate(money(-100, 'INR'), 3);
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(-100);
  });

  it('rejects a non-positive part count', () => {
    expect(() => allocate(money(100, 'INR'), 0)).toThrow(MoneyError);
  });
});

describe('allocateByRatios()', () => {
  it('splits a fee 70/30 and sums back exactly', () => {
    const parts = allocateByRatios(money(1001, 'INR'), [70, 30]);
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(1001);
  });

  it('distributes an awkward remainder across all buckets', () => {
    const parts = allocateByRatios(money(10, 'INR'), [1, 1, 1]);
    expect(parts.map((p) => p.amountMinor)).toEqual([4, 3, 3]);
  });

  it('tolerates a zero ratio', () => {
    const parts = allocateByRatios(money(100, 'INR'), [1, 0]);
    expect(parts[1].amountMinor).toBe(0);
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(100);
  });

  it('rejects empty and all-zero ratios', () => {
    expect(() => allocateByRatios(money(100, 'INR'), [])).toThrow(MoneyError);
    expect(() => allocateByRatios(money(100, 'INR'), [0, 0])).toThrow(MoneyError);
  });
});

describe('format()', () => {
  it('groups Indian rents in lakh style and hides zero decimals', () => {
    // en-IN groups as 8,50,000 — assert on digits to stay resilient to ICU spacing.
    const out = format(fromMajorUnits(850_000, 'INR'));
    expect(out).toContain('8,50,000');
    expect(out).not.toContain('.00');
  });

  it('shows decimals when they are non-zero', () => {
    expect(format(fromMajorUnits('99.50', 'INR'))).toContain('99.50');
  });

  it('can be forced to show decimals', () => {
    expect(format(fromMajorUnits(99, 'INR'), { showDecimals: true })).toContain(
      '99.00',
    );
  });
});

describe('boundary adapters', () => {
  it('hands Razorpay integer minor units', () => {
    expect(toRazorpayAmount(fromMajorUnits(99, 'INR'))).toEqual({
      amount: 9900,
      currency: 'INR',
    });
  });

  it('refuses to charge a negative amount', () => {
    expect(() => toRazorpayAmount(money(-1, 'INR'))).toThrow(/negative/);
  });

  it('reads a bigint column that node-postgres returned as a string', () => {
    expect(fromColumns({ amountMinor: '850000', currency: 'INR' })).toEqual({
      amountMinor: 850_000,
      currency: 'INR',
    });
  });

  it('maps a null column pair to null, not to zero', () => {
    expect(fromColumns({ amountMinor: null, currency: null })).toBeNull();
  });
});

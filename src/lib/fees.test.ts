import { describe, expect, it } from 'vitest';

import {
  type FeeRule,
  computeFee,
  facilitationFeeRefund,
  financialYear,
  formatDocumentNumber,
  gstBreakdown,
  selectRule,
  stateCodeFor,
} from './fees';

const base: FeeRule = {
  id: 'global',
  kind: 'renting_commission',
  basis: 'percent_of_monthly_rent',
  flatAmountMinor: null,
  rateBps: 800,
  minAmountMinor: null,
  maxAmountMinor: null,
  propertyType: null,
  city: null,
  organizationId: null,
  priority: 0,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  taxRateBps: 1800,
};

const context = {
  kind: 'renting_commission' as const,
  propertyType: 'coliving',
  city: 'Pune',
  organizationId: 'org-1',
  at: new Date('2026-09-14'),
};

describe('selectRule()', () => {
  it('falls back to the global default', () => {
    expect(selectRule([base], context)?.id).toBe('global');
  });

  it('prefers an operator-specific rule over a city rule over the default', () => {
    const rules = [
      base,
      { ...base, id: 'pune', city: 'Pune' },
      { ...base, id: 'operator', organizationId: 'org-1' },
    ];
    expect(selectRule(rules, context)?.id).toBe('operator');
  });

  it('lets explicit priority override specificity', () => {
    const rules = [
      { ...base, id: 'operator', organizationId: 'org-1' },
      { ...base, id: 'promo', priority: 10 },
    ];
    expect(selectRule(rules, context)?.id).toBe('promo');
  });

  it('ignores rules for a different operator, city or type', () => {
    const rules = [
      { ...base, id: 'other-org', organizationId: 'org-2', priority: 50 },
      { ...base, id: 'blr', city: 'Bengaluru', priority: 50 },
      { ...base, id: 'pbsa', propertyType: 'pbsa', priority: 50 },
    ];
    expect(selectRule(rules, context)).toBeNull();
  });

  it('respects effective dates, so a rate change never rewrites past bookings', () => {
    const rules = [
      { ...base, id: 'old', effectiveTo: new Date('2026-06-01') },
      { ...base, id: 'new', rateBps: 1000, effectiveFrom: new Date('2026-06-01') },
    ];
    expect(selectRule(rules, { ...context, at: new Date('2026-03-01') })?.id).toBe(
      'old',
    );
    expect(selectRule(rules, context)?.id).toBe('new');
  });

  it('matches city case-insensitively', () => {
    expect(selectRule([{ ...base, city: 'pune' }], context)).not.toBeNull();
  });
});

describe('computeFee()', () => {
  const booking = { monthlyRentMinor: 1_200_000, tenureMonths: 11 };

  it('charges a flat fee', () => {
    expect(computeFee({ ...base, basis: 'flat', flatAmountMinor: 9900 }, booking)).toBe(
      9900,
    );
  });

  it('charges a percentage of monthly rent', () => {
    // 8% of ₹12,000 = ₹960
    expect(computeFee(base, booking)).toBe(96_000);
  });

  it('charges a percentage of gross booking value', () => {
    // 2% of ₹12,000 × 11 = ₹2,640
    expect(
      computeFee({ ...base, basis: 'percent_of_gbv', rateBps: 200 }, booking),
    ).toBe(264_000);
  });

  it('applies an operator rate override', () => {
    expect(computeFee(base, booking, 500)).toBe(60_000);
  });

  it('applies minimum and maximum caps', () => {
    expect(computeFee({ ...base, minAmountMinor: 150_000 }, booking)).toBe(150_000);
    expect(computeFee({ ...base, maxAmountMinor: 50_000 }, booking)).toBe(50_000);
  });

  it('refuses a malformed rule rather than charging zero', () => {
    expect(() =>
      computeFee({ ...base, basis: 'flat', flatAmountMinor: null }, booking),
    ).toThrow();
    expect(() => computeFee({ ...base, rateBps: null }, booking)).toThrow();
  });
});

describe('gstBreakdown()', () => {
  it('adds 18% GST on a ₹99 fee', () => {
    const gst = gstBreakdown({
      taxableMinor: 9900,
      taxRateBps: 1800,
      supplierStateCode: '29',
      placeOfSupplyStateCode: '27',
    });
    expect(gst.taxMinor).toBe(1782);
    expect(gst.totalMinor).toBe(11_682);
  });

  it('splits into CGST and SGST within a state', () => {
    const gst = gstBreakdown({
      taxableMinor: 9900,
      taxRateBps: 1800,
      supplierStateCode: '29',
      placeOfSupplyStateCode: '29',
    });
    expect(gst.supplyType).toBe('intra_state');
    expect(gst.cgstMinor + gst.sgstMinor).toBe(gst.taxMinor);
    expect(gst.igstMinor).toBe(0);
  });

  it('charges IGST across states', () => {
    const gst = gstBreakdown({
      taxableMinor: 9900,
      taxRateBps: 1800,
      supplierStateCode: '29',
      placeOfSupplyStateCode: '07',
    });
    expect(gst.supplyType).toBe('inter_state');
    expect(gst.igstMinor).toBe(gst.taxMinor);
    expect(gst.cgstMinor + gst.sgstMinor).toBe(0);
  });

  it('never loses a paisa when the tax is odd', () => {
    const gst = gstBreakdown({
      taxableMinor: 9901,
      taxRateBps: 1800,
      supplierStateCode: '29',
      placeOfSupplyStateCode: '29',
    });
    expect(gst.cgstMinor + gst.sgstMinor).toBe(gst.taxMinor);
  });
});

describe('financialYear()', () => {
  it('runs April to March', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00+05:30'))).toBe('2026-27');
    expect(financialYear(new Date('2027-03-31T23:59:00+05:30'))).toBe('2026-27');
  });

  it('uses IST, so 31 March evening UTC is already April in India', () => {
    // 31 Mar 20:00 UTC = 1 Apr 01:30 IST
    expect(financialYear(new Date('2027-03-31T20:00:00Z'))).toBe('2027-28');
  });

  it('formats document numbers with a padded serial', () => {
    expect(formatDocumentNumber('HS', '2026-27', 42)).toBe('HS/26-27/000042');
  });
});

describe('facilitationFeeRefund()', () => {
  const now = new Date('2026-09-14T10:00:00Z');

  it('refunds in full when the operator could not host', () => {
    const r = facilitationFeeRefund({
      paidMinor: 11_682,
      reason: 'host_unavailable',
      moveInDate: new Date('2026-09-15'),
      now,
    });
    expect(r.refundMinor).toBe(11_682);
  });

  it('refunds in full when the resident withdraws well before move-in', () => {
    const r = facilitationFeeRefund({
      paidMinor: 11_682,
      reason: 'resident_withdrew',
      moveInDate: new Date('2026-10-01'),
      now,
    });
    expect(r.refundMinor).toBe(11_682);
  });

  it('retains the fee when the resident withdraws close to move-in', () => {
    const r = facilitationFeeRefund({
      paidMinor: 11_682,
      reason: 'resident_withdrew',
      moveInDate: new Date('2026-09-17'),
      now,
    });
    expect(r.refundMinor).toBe(0);
    expect(r.explanation).toMatch(/not refundable/);
  });

  it('honours an operator-specific window', () => {
    const r = facilitationFeeRefund({
      paidMinor: 11_682,
      reason: 'resident_withdrew',
      moveInDate: new Date('2026-09-17'),
      now,
      policy: { fullRefundDaysBeforeMoveIn: 2 },
    });
    expect(r.refundMinor).toBe(11_682);
  });

  it('owes nothing when nothing was paid', () => {
    expect(
      facilitationFeeRefund({
        paidMinor: 0,
        reason: 'host_unavailable',
        moveInDate: now,
        now,
      }).refundMinor,
    ).toBe(0);
  });
});

describe('stateCodeFor()', () => {
  it('maps the anchor-city states', () => {
    expect(stateCodeFor('Karnataka')).toBe('29');
    expect(stateCodeFor('Maharashtra')).toBe('27');
    expect(stateCodeFor('Delhi')).toBe('07');
    expect(stateCodeFor('uttar pradesh')).toBe('09');
    expect(stateCodeFor('Haryana')).toBe('06');
  });

  it('returns null for unknown or missing', () => {
    expect(stateCodeFor('Atlantis')).toBeNull();
    expect(stateCodeFor(null)).toBeNull();
  });
});

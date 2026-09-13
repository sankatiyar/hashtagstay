import { allocate, money, multiplyByRate } from '@/lib/money';

/**
 * Fee engine (FR-21) and GST arithmetic.
 *
 * Pure functions over rule rows, so the commercial logic is testable without a
 * database and the booking service only has to load rules and snapshot results.
 *
 * Conventions:
 *  - Rates are integer basis points (800 = 8%).
 *  - A rule's amount is the **taxable value**; GST is added on top. A ₹99
 *    facilitation fee at 18% charges ₹116.82.
 *  - All arithmetic goes through lib/money with banker's rounding.
 */

export type FeeKind =
  'facilitation_fee' | 'renting_commission' | 'service_fee' | 'access_to_market_fee';

export type FeeBasis = 'flat' | 'percent_of_gbv' | 'percent_of_monthly_rent';

export interface FeeRule {
  id: string;
  kind: FeeKind;
  basis: FeeBasis;
  flatAmountMinor: number | null;
  rateBps: number | null;
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
  propertyType: string | null;
  city: string | null;
  organizationId: string | null;
  priority: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  taxRateBps: number | null;
}

export interface FeeContext {
  kind: FeeKind;
  propertyType: string;
  city: string;
  organizationId: string;
  at: Date;
}

const specificity = (rule: FeeRule) =>
  Number(rule.propertyType !== null) +
  Number(rule.city !== null) +
  Number(rule.organizationId !== null) * 2;

/**
 * Choose the applicable rule. A null scope column is a wildcard. Highest
 * explicit priority wins; then the more specific rule (an operator-specific
 * rate beats a city rate beats the global default); then the most recently
 * effective.
 */
export function selectRule(
  rules: readonly FeeRule[],
  context: FeeContext,
): FeeRule | null {
  const applicable = rules.filter(
    (rule) =>
      rule.kind === context.kind &&
      rule.effectiveFrom.getTime() <= context.at.getTime() &&
      (rule.effectiveTo === null ||
        rule.effectiveTo.getTime() > context.at.getTime()) &&
      (rule.propertyType === null || rule.propertyType === context.propertyType) &&
      (rule.city === null || rule.city.toLowerCase() === context.city.toLowerCase()) &&
      (rule.organizationId === null || rule.organizationId === context.organizationId),
  );
  if (applicable.length === 0) return null;

  return [...applicable].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    const spec = specificity(b) - specificity(a);
    if (spec !== 0) return spec;
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  })[0];
}

export class FeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeeError';
  }
}

/** Taxable fee amount in minor units for a booking under `rule`. */
export function computeFee(
  rule: Pick<
    FeeRule,
    'basis' | 'flatAmountMinor' | 'rateBps' | 'minAmountMinor' | 'maxAmountMinor'
  >,
  booking: { monthlyRentMinor: number; tenureMonths: number },
  rateOverrideBps?: number | null,
): number {
  let amount: number;

  if (rule.basis === 'flat') {
    if (rule.flatAmountMinor === null)
      throw new FeeError('A flat fee rule has no amount.');
    amount = rule.flatAmountMinor;
  } else {
    const bps = rateOverrideBps ?? rule.rateBps;
    if (bps === null || bps === undefined)
      throw new FeeError('A percentage fee rule has no rate.');
    const base =
      rule.basis === 'percent_of_gbv'
        ? booking.monthlyRentMinor * booking.tenureMonths
        : booking.monthlyRentMinor;
    amount = multiplyByRate(money(base, 'INR'), bps / 10_000).amountMinor;
  }

  if (rule.minAmountMinor !== null && amount < rule.minAmountMinor)
    amount = rule.minAmountMinor;
  if (rule.maxAmountMinor !== null && amount > rule.maxAmountMinor)
    amount = rule.maxAmountMinor;
  return amount;
}

export type SupplyType = 'intra_state' | 'inter_state';

export interface GstBreakdown {
  taxableMinor: number;
  taxRateBps: number;
  supplyType: SupplyType;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Split GST. Within one state the tax is CGST plus SGST in equal halves;
 * across states it is IGST. The halves are allocated so they always sum back
 * to the full tax — an odd paisa goes to CGST rather than vanishing.
 */
export function gstBreakdown(params: {
  taxableMinor: number;
  taxRateBps: number;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
}): GstBreakdown {
  const tax = multiplyByRate(
    money(params.taxableMinor, 'INR'),
    params.taxRateBps / 10_000,
  );
  const supplyType: SupplyType =
    params.supplierStateCode === params.placeOfSupplyStateCode
      ? 'intra_state'
      : 'inter_state';

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (supplyType === 'intra_state') {
    const [a, b] = allocate(tax, 2);
    cgst = a.amountMinor;
    sgst = b.amountMinor;
  } else {
    igst = tax.amountMinor;
  }

  return {
    taxableMinor: params.taxableMinor,
    taxRateBps: params.taxRateBps,
    supplyType,
    cgstMinor: cgst,
    sgstMinor: sgst,
    igstMinor: igst,
    taxMinor: tax.amountMinor,
    totalMinor: params.taxableMinor + tax.amountMinor,
  };
}

/** Indian financial year label for a date, in IST: `2026-27`. */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const year = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** `HS/26-27/000123` */
export function formatDocumentNumber(
  series: string,
  fy: string,
  serial: number,
): string {
  const short = `${fy.slice(2, 4)}-${fy.slice(5, 7)}`;
  return `${series}/${short}/${String(serial).padStart(6, '0')}`;
}

/**
 * Facilitation-fee refund on cancellation (FR-23).
 *
 * The platform's own policy for its own fee. Rent and deposit refunds are
 * between the resident and the operator under the operator's terms, which the
 * booking snapshots but we do not collect.
 *
 *  - If we or the operator caused the cancellation, the fee is refunded in full.
 *  - If the resident withdraws before the host confirmed, full refund (they
 *    cannot have paid, but the rule holds if they somehow did).
 *  - If the resident withdraws at least `fullRefundDaysBeforeMoveIn` days
 *    before move-in, full refund; inside that window the fee is retained,
 *    because the bed was held and the desk did the work.
 */
export type CancelReason =
  | 'host_unavailable'
  | 'resident_withdrew'
  | 'payment_failed'
  | 'verification_failed'
  | 'duplicate'
  | 'other';

export interface RefundPolicy {
  fullRefundDaysBeforeMoveIn: number;
}

export const DEFAULT_REFUND_POLICY: RefundPolicy = { fullRefundDaysBeforeMoveIn: 7 };

export function facilitationFeeRefund(params: {
  paidMinor: number;
  reason: CancelReason;
  moveInDate: Date;
  now: Date;
  policy?: Partial<RefundPolicy> | null;
}): { refundMinor: number; explanation: string } {
  const policy = { ...DEFAULT_REFUND_POLICY, ...(params.policy ?? {}) };
  if (params.paidMinor <= 0) {
    return {
      refundMinor: 0,
      explanation: 'No facilitation fee was paid, so nothing is due.',
    };
  }

  if (params.reason !== 'resident_withdrew' && params.reason !== 'other') {
    return {
      refundMinor: params.paidMinor,
      explanation:
        'The cancellation was not the resident’s choice, so the facilitation fee is refunded in full.',
    };
  }

  const daysBefore = Math.floor(
    (params.moveInDate.getTime() - params.now.getTime()) / 86_400_000,
  );
  if (daysBefore >= policy.fullRefundDaysBeforeMoveIn) {
    return {
      refundMinor: params.paidMinor,
      explanation: `Cancelled ${daysBefore} days before move-in, so the facilitation fee is refunded in full.`,
    };
  }
  return {
    refundMinor: 0,
    explanation: `Cancelled less than ${policy.fullRefundDaysBeforeMoveIn} days before move-in, so the facilitation fee is not refundable under our policy.`,
  };
}

/** GST state codes, for place of supply. */
export const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

export function stateCodeFor(stateName: string | null | undefined): string | null {
  if (!stateName) return null;
  return GST_STATE_CODES[stateName.trim().toLowerCase()] ?? null;
}

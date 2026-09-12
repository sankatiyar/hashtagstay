/**
 * The only place in the codebase that represents or arithmetics currency.
 *
 * Rule (see build plan, "Money rule"): money is ALWAYS an integer count of minor
 * units plus an ISO-4217 currency code. Never a float, never a bare number, never
 * a string like "₹8,500". Floats silently lose paise and will not reconcile
 * against Razorpay; a bare number cannot survive the Phase-2 multi-currency work
 * (FR-05) without a migration we have promised not to need ("no re-platforming").
 */

/** ISO-4217 codes we are prepared to handle. Extend deliberately, not casually. */
export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Minor units per major unit. All currently supported currencies are 2-decimal,
 * but do not assume that — JPY/KRW are 0-decimal and KWD/BHD are 3-decimal, and
 * an outbound-education corridor could plausibly add one.
 */
const MINOR_UNIT_EXPONENT: Record<Currency, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
};

export interface Money {
  /** Integer count of minor units (paise for INR, cents for USD). */
  readonly amountMinor: number;
  readonly currency: Currency;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === 'string' &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}

/**
 * Construct Money from minor units. This is the canonical constructor — prefer it
 * everywhere, because it is the shape the database and Razorpay both use.
 */
export function money(amountMinor: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(
      `amountMinor must be a safe integer, received ${amountMinor}. ` +
        'A fractional value here means a float leaked in upstream.',
    );
  }
  if (!isCurrency(currency)) {
    throw new MoneyError(`Unsupported currency: ${String(currency)}`);
  }
  return { amountMinor, currency };
}

/**
 * Construct Money from a major-unit amount — for operator-facing input only
 * (an ops user types "8500" for the rent). Rejects more decimal places than the
 * currency has, rather than rounding them away silently.
 */
export function fromMajorUnits(major: number | string, currency: Currency): Money {
  if (!isCurrency(currency)) {
    throw new MoneyError(`Unsupported currency: ${String(currency)}`);
  }
  const text = typeof major === 'number' ? String(major) : major.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new MoneyError(`Not a valid decimal amount: "${text}"`);
  }

  const exponent = MINOR_UNIT_EXPONENT[currency];
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');

  if (fraction.length > exponent) {
    throw new MoneyError(
      `${currency} has ${exponent} decimal place(s); "${text}" has ${fraction.length}. ` +
        'Refusing to round — fix the input.',
    );
  }

  const padded = fraction.padEnd(exponent, '0');
  const amountMinor = Number(`${whole}${padded}`);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(`Amount out of safe integer range: "${text}"`);
  }
  return money(negative ? -amountMinor : amountMinor, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Cannot combine ${a.currency} with ${b.currency}. ` +
        'Cross-currency arithmetic requires an explicit, dated FX rate — ' +
        'which is Phase 2 (FR-05) and deliberately not implemented here.',
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sum(amounts: readonly Money[], currency: Currency): Money {
  return amounts.reduce((acc, m) => add(acc, m), money(0, currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export const isZero = (m: Money): boolean => m.amountMinor === 0;
export const isNegative = (m: Money): boolean => m.amountMinor < 0;

/**
 * Multiply by an integer count (e.g. rent × 3 months). Exact by construction —
 * use this rather than `multiplyByRate` whenever the multiplier is a whole number.
 */
export function multiplyByInteger(m: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor)) {
    throw new MoneyError(`factor must be an integer, received ${factor}`);
  }
  return money(m.amountMinor * factor, m.currency);
}

export type RoundingMode = 'half-up' | 'half-even' | 'down' | 'up';

/**
 * Multiply by a fractional rate — percentage commission, GST. Rounds explicitly,
 * because there is no correct universal default and an implicit one is how fee
 * revenue quietly drifts from the invoice total.
 *
 * `half-even` (banker's rounding) is the default: it does not accumulate an
 * upward bias across thousands of bookings the way `half-up` does.
 */
export function multiplyByRate(
  m: Money,
  rate: number,
  mode: RoundingMode = 'half-even',
): Money {
  if (!Number.isFinite(rate)) {
    throw new MoneyError(`rate must be finite, received ${rate}`);
  }
  return money(roundTo(m.amountMinor * rate, mode), m.currency);
}

function roundTo(value: number, mode: RoundingMode): number {
  switch (mode) {
    case 'down':
      return Math.trunc(value);
    case 'up':
      return value < 0 ? Math.floor(value) : Math.ceil(value);
    case 'half-up':
      return Math.sign(value) * Math.round(Math.abs(value));
    case 'half-even': {
      const sign = Math.sign(value);
      const abs = Math.abs(value);
      const floor = Math.floor(abs);
      const remainder = abs - floor;
      if (Math.abs(remainder - 0.5) > Number.EPSILON) {
        return sign * Math.round(abs);
      }
      // Exactly .5 — round to the nearest even integer.
      return sign * (floor % 2 === 0 ? floor : floor + 1);
    }
  }
}

/**
 * Split an amount into `parts` without losing or inventing a single minor unit.
 * Remainder is distributed one unit at a time across the leading parts, so the
 * result always sums back to the input. Needed wherever a total is apportioned
 * (fee vs GST components, a statement split across bookings).
 */
export function allocate(m: Money, parts: number): Money[] {
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new MoneyError(`parts must be a positive integer, received ${parts}`);
  }
  const base = Math.trunc(m.amountMinor / parts);
  let remainder = m.amountMinor - base * parts;
  const step = remainder < 0 ? -1 : 1;

  return Array.from({ length: parts }, () => {
    let share = base;
    if (remainder !== 0) {
      share += step;
      remainder -= step;
    }
    return money(share, m.currency);
  });
}

/**
 * Allocate by integer ratios (e.g. [70, 30]) with the same no-loss guarantee.
 */
export function allocateByRatios(m: Money, ratios: readonly number[]): Money[] {
  if (ratios.length === 0) {
    throw new MoneyError('ratios must not be empty');
  }
  if (ratios.some((r) => !Number.isSafeInteger(r) || r < 0)) {
    throw new MoneyError('ratios must be non-negative integers');
  }
  const total = ratios.reduce((a, b) => a + b, 0);
  if (total === 0) {
    throw new MoneyError('ratios must not sum to zero');
  }

  const shares = ratios.map((r) => Math.trunc((m.amountMinor * r) / total));
  let remainder = m.amountMinor - shares.reduce((a, b) => a + b, 0);
  const step = remainder < 0 ? -1 : 1;

  for (let i = 0; remainder !== 0; i = (i + 1) % shares.length) {
    shares[i] += step;
    remainder -= step;
  }
  return shares.map((s) => money(s, m.currency));
}

/**
 * Format for display. Locale defaults to en-IN because Phase 1 is India-only and
 * the lakh/crore grouping is what residents and operators expect to read.
 */
export function format(
  m: Money,
  options: { locale?: string; showDecimals?: boolean } = {},
): string {
  const { locale = 'en-IN', showDecimals } = options;
  const exponent = MINOR_UNIT_EXPONENT[m.currency];
  const major = m.amountMinor / 10 ** exponent;

  // Rents and fees are whole rupees in practice; showing "₹8,500.00" is noise.
  // Default to hiding decimals only when they are genuinely zero.
  const withDecimals = showDecimals ?? m.amountMinor % 10 ** exponent !== 0;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: withDecimals ? exponent : 0,
    maximumFractionDigits: withDecimals ? exponent : 0,
  }).format(major);
}

/** Razorpay's order/payment APIs take integer minor units — hand them this. */
export function toRazorpayAmount(m: Money): { amount: number; currency: Currency } {
  if (m.amountMinor < 0) {
    throw new MoneyError('Cannot charge a negative amount');
  }
  return { amount: m.amountMinor, currency: m.currency };
}

/** Round-trip helpers for the `{ amount_minor, currency }` column pair. */
export const toColumns = (m: Money) => ({
  amountMinor: m.amountMinor,
  currency: m.currency,
});

export function fromColumns(row: {
  amountMinor: number | string | null;
  currency: string | null;
}): Money | null {
  if (row.amountMinor === null || row.currency === null) return null;
  // Postgres bigint arrives as a string via node-postgres.
  const amountMinor =
    typeof row.amountMinor === 'string' ? Number(row.amountMinor) : row.amountMinor;
  return money(amountMinor, row.currency as Currency);
}

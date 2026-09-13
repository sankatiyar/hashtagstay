/**
 * Indian mobile number handling.
 *
 * Phone is the primary resident identity (OTP login, lead dedupe, masked
 * calls), so one canonical form matters: `+91` followed by ten digits starting
 * 6–9. Everything that stores or compares a number goes through here, or the
 * same person becomes three leads — `09876543210`, `+91 98765 43210` and
 * `9876543210`.
 */

export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneError';
  }
}

/** Canonical E.164, or null if the input is not a valid Indian mobile. */
export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    if (!digits.startsWith('+91')) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export function requireIndianMobile(input: string | null | undefined): string {
  const normalized = normalizeIndianMobile(input);
  if (!normalized) {
    throw new PhoneError('Enter a valid 10-digit Indian mobile number.');
  }
  return normalized;
}

/**
 * Display with the middle masked: `+91 98••• ••210`. Used anywhere staff or a
 * host sees a resident's number without needing to dial it themselves — dialling
 * goes through masked calling.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const local = e164.replace(/^\+91/, '');
  if (local.length !== 10) return '••••••••••';
  return `+91 ${local.slice(0, 2)}••• ••${local.slice(7)}`;
}

/** Readable full form, `+91 98765 43210`. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const local = e164.replace(/^\+91/, '');
  if (local.length !== 10) return e164;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

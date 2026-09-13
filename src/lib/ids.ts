import { randomBytes } from 'node:crypto';

import { customAlphabet } from 'nanoid';

/**
 * Human-quotable references and unguessable public tokens.
 *
 * References are read aloud on sales calls and typed into WhatsApp, so the
 * alphabet drops characters people confuse (0/O, 1/I/L). Tokens gate public
 * pages (shortlists, payment pages) and are 128 bits of randomness.
 */

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const referenceBody = customAlphabet(REFERENCE_ALPHABET, 7);

export type ReferenceKind = 'lead' | 'booking' | 'ticket';

const PREFIX: Record<ReferenceKind, string> = {
  lead: 'HSL',
  booking: 'HSB',
  ticket: 'HST',
};

/** e.g. `HSL-7K3Q9PA`. 31^7 ≈ 27 billion — collisions are caught by the unique index. */
export function newReference(kind: ReferenceKind): string {
  return `${PREFIX[kind]}-${referenceBody()}`;
}

/** 128-bit URL-safe token for public links. */
export function newPublicToken(): string {
  return randomBytes(16).toString('base64url');
}

/** Six-digit numeric one-time code. */
export function newOtpCode(): string {
  // Rejection-free: 6 digits from a uniform 0..999999.
  const value = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return value.toString().padStart(6, '0');
}

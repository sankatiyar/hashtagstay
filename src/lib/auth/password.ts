import bcrypt from 'bcryptjs';

/**
 * Password hashing.
 *
 * bcryptjs rather than native bcrypt or argon2: pure JS, so there is no build
 * toolchain requirement on any developer machine or CI runner. The cost factor
 * matters more than the algorithm choice at this scale.
 */

/**
 * Cost 12, not the library default of 10. Roughly 250ms per hash on commodity
 * hardware — slow enough to make offline cracking of a leaked hash expensive,
 * fast enough that a staff login does not feel broken.
 */
const COST = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, COST);

/**
 * Verify a password.
 *
 * Takes `hash: string | null` deliberately. Residents have no password at all,
 * so a null hash is a normal state rather than an error — but it must never
 * authenticate. Running a dummy comparison keeps the timing of "no such user"
 * indistinguishable from "wrong password", so the endpoint cannot be used to
 * enumerate which email addresses exist.
 */
export async function verifyPassword(
  plain: string,
  hash: string | null,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/**
 * A genuine cost-12 bcrypt hash, compared against when no user is found so the
 * work done is equivalent (measured at ~330ms, matching a real verification).
 * It must be a valid hash: bcrypt returns false almost instantly for malformed
 * input, which would defeat the entire point. The plaintext behind it is
 * irrelevant and is never used to authenticate anything.
 */
const DUMMY_HASH = '$2b$12$QDVPxXiAn2lkPIkshbwa/eiEcXMTNvDhLEoU0sBr7jClcQCYTmECC';

/**
 * Minimum viable password policy for staff and host accounts.
 *
 * Length over composition rules: mandated symbol classes push people towards
 * `Password1!` and add little. Twelve characters with a check against the
 * obvious candidates is a better trade.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456789012',
  'qwertyuiop',
  'letmein12345',
  'iloveyou1234',
  'administrator',
  'hashtagstay',
  'hashtagstay123',
]);

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

export function checkPasswordStrength(plain: string): PasswordCheck {
  const problems: string[] = [];

  if (plain.length < 12) {
    problems.push('Use at least 12 characters.');
  }
  if (plain.length > 200) {
    // bcrypt truncates beyond 72 bytes; a very long input is either a mistake
    // or an attempt to exhaust CPU.
    problems.push('Use at most 200 characters.');
  }
  if (COMMON_PASSWORDS.has(plain.toLowerCase())) {
    problems.push('That password is too common.');
  }
  if (/^(.)\1+$/.test(plain)) {
    problems.push('Do not use a single repeated character.');
  }

  return { ok: problems.length === 0, problems };
}

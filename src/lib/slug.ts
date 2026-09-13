/**
 * Slug generation.
 *
 * A property slug becomes a public URL and an SEO surface, and
 * `properties.slug` is unique. Two consequences drive this module:
 *
 *  - **A slug is never regenerated after publish.** Changing it breaks inbound
 *    links and discards accumulated ranking. Renaming a property therefore
 *    leaves its slug alone; only the display name changes.
 *  - **Uniqueness is resolved by suffixing, not by failing.** "Nest
 *    Koramangala" legitimately exists twice across operators, and an ops user
 *    entering the second one should not have to invent a URL.
 */

/**
 * Transliterations for characters that would otherwise be stripped, losing the
 * word. Devanagari and other Indic scripts are not transliterated here — a
 * property named in Devanagari gets a slug from its ASCII fallback instead,
 * because a wrong transliteration is worse than an explicit one chosen by ops.
 */
const CHARACTER_MAP: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
  ß: 'ss',
  đ: 'd',
  ł: 'l',
  ħ: 'h',
  ı: 'i',
  '&': ' and ',
  '@': ' at ',
  '₹': ' rs ',
  '%': ' pc ',
  '+': ' plus ',
};

/**
 * Produce a URL-safe slug.
 *
 * Returns an empty string when nothing usable survives — callers must handle
 * that rather than publishing a blank URL. `slugifyOrThrow` is there for call
 * sites that would rather fail loudly.
 */
export function slugify(input: string): string {
  if (!input) return '';

  let text = input.toLowerCase();

  for (const [from, to] of Object.entries(CHARACTER_MAP)) {
    text = text.replaceAll(from, to);
  }

  // NFD splits an accented character into base + combining mark, so the marks
  // can be dropped and the base letter kept: "Café" -> "cafe", not "caf".
  text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');

  return (
    text
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      // Collapse runs introduced by the replacements above.
      .replace(/-{2,}/g, '-')
      // Leave room for a uniqueness suffix inside a sane URL length.
      .slice(0, 80)
      .replace(/-+$/g, '')
  );
}

export function slugifyOrThrow(input: string): string {
  const slug = slugify(input);
  if (!slug) {
    throw new Error(
      `Could not derive a slug from "${input}". Provide one explicitly — this ` +
        'happens when the name has no Latin letters or digits.',
    );
  }
  return slug;
}

export const isValidSlug = (slug: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100;

/**
 * Make a slug unique against a set of taken values by appending -2, -3, ...
 *
 * Starts at 2 rather than 1 because "nest-koramangala-1" implies a first one
 * named "-1", which does not exist.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }

  throw new Error(
    `Could not find a free slug for "${base}" after 999 attempts. That almost ` +
      'certainly indicates duplicate data rather than genuine collisions.',
  );
}

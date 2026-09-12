/**
 * Time helpers.
 *
 * These take an explicit `now` so that "how old is this?" is computed once, on
 * the server, where the data is fetched — not during a component render.
 * Reading the clock inside render is impure: the value differs between the
 * server pass and any client re-render, which makes output unstable and is why
 * React's purity rule rejects it.
 */

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days elapsed since `date`. Negative for a future date. */
export function ageInDays(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
}

/** Whole days elapsed, or null when there is no date at all. */
export function ageInDaysOrNull(
  date: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return ageInDays(parsed, now);
}

/** True when `date` is in the past. Null/absent is treated as not expired. */
export function isExpired(
  date: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!date) return false;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < now.getTime();
}

/** ISO date (YYYY-MM-DD), for display where a precise timestamp is noise. */
export function isoDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

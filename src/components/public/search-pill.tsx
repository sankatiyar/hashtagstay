import Link from 'next/link';

import { Icon } from './icons';

/**
 * The pill search. A plain GET form to /search, so it works before JavaScript
 * loads and every search is a real, shareable URL.
 */
export function SearchPill({
  cities,
  campuses,
}: {
  cities: { city: string; listingCount: number }[];
  campuses: { name: string; slug: string }[];
}) {
  const segment =
    'flex min-w-0 flex-1 flex-col justify-center rounded-full px-6 py-3 transition hover:bg-sand focus-within:bg-white focus-within:shadow-(--shadow-lift)';
  const caption = 'text-xs font-bold text-ink';
  const control =
    'mt-0.5 w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm text-ink-soft outline-none';

  return (
    <form
      action="/search"
      method="get"
      className="flex w-full flex-col gap-1 rounded-3xl border border-line bg-white p-2 shadow-(--shadow-lift) md:flex-row md:items-center md:rounded-full md:p-1.5"
    >
      <label className={segment}>
        <span className={caption}>Where</span>
        <select name="city" defaultValue="" className={control}>
          <option value="">Any city</option>
          {cities.map((entry) => (
            <option key={entry.city} value={entry.city}>
              {entry.city} · {entry.listingCount} stays
            </option>
          ))}
        </select>
      </label>
      <span aria-hidden="true" className="hidden h-8 w-px bg-line md:block" />
      <label className={segment}>
        <span className={caption}>Near campus</span>
        <select name="near" defaultValue="" className={control}>
          <option value="">Anywhere</option>
          {campuses.map((campus) => (
            <option key={campus.slug} value={campus.slug}>
              {campus.name}
            </option>
          ))}
        </select>
      </label>
      <span aria-hidden="true" className="hidden h-8 w-px bg-line md:block" />
      <label className={segment}>
        <span className={caption}>Budget</span>
        <input
          name="budget"
          inputMode="numeric"
          placeholder="Up to ₹ / month"
          className="mt-0.5 w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
        />
      </label>
      <span aria-hidden="true" className="hidden h-8 w-px bg-line md:block" />
      <label className={segment}>
        <span className={caption}>Who</span>
        <select name="gender" defaultValue="" className={control}>
          <option value="">Anyone</option>
          <option value="female_only">Women-only</option>
          <option value="male_only">Men-only</option>
        </select>
      </label>
      <button
        type="submit"
        className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 font-bold text-white transition hover:bg-brand-700 md:ml-1"
      >
        <Icon name="search" className="h-4 w-4" strokeWidth={3} />
        <span className="md:hidden lg:inline">Search</span>
      </button>
    </form>
  );
}

/** The compact pill in the header, which opens the full search page. */
export function CompactSearchPill() {
  return (
    <Link
      href="/search"
      className="flex items-center rounded-full border border-line bg-white py-1.5 pr-1.5 pl-5 text-sm shadow-(--shadow-float) transition hover:shadow-(--shadow-lift)"
    >
      <span className="font-semibold text-ink">Any city</span>
      <span aria-hidden="true" className="mx-4 h-5 w-px bg-line" />
      <span className="font-semibold text-ink">Any budget</span>
      <span aria-hidden="true" className="mx-4 hidden h-5 w-px bg-line xl:block" />
      <span className="hidden text-ink-soft xl:inline">Near campus</span>
      <span className="ml-4 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
        <Icon name="search" className="h-3.5 w-3.5" strokeWidth={3.2} />
      </span>
    </Link>
  );
}

/**
 * Hero search form.
 *
 * A plain GET form to /search, not a client component. The result is a real,
 * shareable URL rather than client state, it works before JavaScript loads,
 * and a crawler can follow it — which matters on the page the whole SEO funnel
 * lands on.
 */
const fieldShell =
  'group relative flex flex-col justify-center rounded-2xl px-4 py-2.5 transition hover:bg-sand/70 focus-within:bg-sand/70';
const fieldLabel = 'text-[0.7rem] font-semibold tracking-wide text-ink uppercase';
const control =
  'mt-0.5 w-full appearance-none bg-transparent text-sm text-ink-soft outline-none focus:text-ink';

export function HeroSearch({
  cities,
  campuses,
}: {
  cities: { city: string; listingCount: number }[];
  campuses: { name: string; slug: string; city: string }[];
}) {
  return (
    <form
      action="/search"
      method="get"
      className="rounded-3xl border border-line bg-white p-2 shadow-(--shadow-lift)"
    >
      {/* One row only at xl: in the hero's half-width column, five fields in a
          row squeeze the labels onto two lines. */}
      <div className="grid gap-1 sm:grid-cols-2 2xl:grid-cols-[1fr_1.3fr_1fr_1fr_auto] 2xl:items-stretch 2xl:divide-x 2xl:divide-line">
        <label className={fieldShell}>
          <span className={fieldLabel}>City</span>
          <select name="city" className={control} defaultValue="">
            <option value="">Any city</option>
            {cities.map((entry) => (
              <option key={entry.city} value={entry.city}>
                {entry.city} · {entry.listingCount} stays
              </option>
            ))}
          </select>
        </label>

        <label className={fieldShell}>
          <span className={fieldLabel}>Near a campus</span>
          <select name="near" className={control} defaultValue="">
            <option value="">Anywhere in the city</option>
            {campuses.map((campus) => (
              <option key={campus.slug} value={campus.slug}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldShell}>
          <span className={fieldLabel}>Budget / month</span>
          <span className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft">
            ₹
            <input
              name="budget"
              inputMode="numeric"
              placeholder="Up to 15,000"
              className="w-full bg-transparent text-ink outline-none placeholder:text-ink-soft"
            />
          </span>
        </label>

        <label className={fieldShell}>
          <span className={fieldLabel}>Looking for</span>
          <select name="gender" className={control} defaultValue="">
            <option value="">No preference</option>
            <option value="female_only">Women-only</option>
            <option value="male_only">Men-only</option>
          </select>
        </label>

        <div className="flex items-center p-1 sm:col-span-2 2xl:col-span-1 2xl:border-l-0 2xl:pl-2">
          <button type="submit" className="btn-primary w-full gap-2.5 py-3.5 2xl:w-auto 2xl:px-7">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            Search
          </button>
        </div>
      </div>
    </form>
  );
}

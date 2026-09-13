/**
 * Hero search form.
 *
 * A plain GET form to /search, not a client component. The result is a real,
 * shareable URL rather than client state, it works before JavaScript loads,
 * and a crawler can follow it — which matters on the page the whole SEO funnel
 * lands on.
 */
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
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="hero-city"
            className="block text-xs font-medium text-slate-600"
          >
            City
          </label>
          <select
            id="hero-city"
            name="city"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
          >
            <option value="">Any city</option>
            {cities.map((entry) => (
              <option key={entry.city} value={entry.city}>
                {entry.city} ({entry.listingCount})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="hero-near"
            className="block text-xs font-medium text-slate-600"
          >
            Near a campus
          </label>
          <select
            id="hero-near"
            name="near"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
          >
            <option value="">Anywhere</option>
            {campuses.map((campus) => (
              <option key={campus.slug} value={campus.slug}>
                {campus.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="hero-budget"
            className="block text-xs font-medium text-slate-600"
          >
            Monthly budget
          </label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
              ₹
            </span>
            <input
              id="hero-budget"
              name="budget"
              inputMode="numeric"
              placeholder="15,000"
              className="w-full rounded-lg border border-slate-300 py-2.5 pr-3 pl-7 text-sm outline-none focus:border-slate-900"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="hero-gender"
            className="block text-xs font-medium text-slate-600"
          >
            Looking for
          </label>
          <select
            id="hero-gender"
            name="gender"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-900"
          >
            <option value="">No preference</option>
            <option value="female_only">Women-only</option>
            <option value="male_only">Men-only</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="mt-4 w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto sm:px-8"
      >
        Search verified stays
      </button>
    </form>
  );
}

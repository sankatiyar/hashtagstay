import type { Metadata } from 'next';
import Link from 'next/link';

import { ListingCard } from '@/components/public/listing-card';
import { absoluteUrl, jsonLdScript, organizationJsonLd, pageTitle } from '@/lib/seo';
import {
  listLiveCities,
  listPublishedInstitutions,
  searchListings,
} from '@/lib/services/public-search';

export const revalidate = 900;

export const metadata: Metadata = {
  title: pageTitle('Verified co-living and student housing in India'),
  description:
    'Find verified co-living, student housing and home-sharing across India. Search by campus, budget and room type — then a relationship manager helps you close it over the phone.',
  alternates: { canonical: absoluteUrl('/') },
};

export default async function HomePage() {
  const [{ rows }, cities, campuses] = await Promise.all([
    searchListings({ pageSize: 6 }),
    listLiveCities(),
    listPublishedInstitutions(),
  ]);

  // Group campuses by city so the links read as a place, not a flat list.
  const byCity = new Map<string, typeof campuses>();
  for (const campus of campuses) {
    const list = byCity.get(campus.city) ?? [];
    list.push(campus);
    byCity.set(campus.city, list);
  }

  return (
    <main>
      <script {...jsonLdScript(organizationJsonLd())} />

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Verified co-living and student housing, without the guesswork
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-slate-600">
            Search by campus, budget and room type. Every listing shows exactly which
            checks we completed — and a relationship manager confirms availability with
            the operator before you commit to anything.
          </p>

          <form
            action="/search"
            method="get"
            className="mt-8 flex max-w-3xl flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-44 flex-1">
              <label
                htmlFor="home-city"
                className="block text-xs font-medium text-slate-600"
              >
                City
              </label>
              <select
                id="home-city"
                name="city"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
              >
                <option value="">Any city</option>
                {cities.map((entry) => (
                  <option key={entry.city} value={entry.city}>
                    {entry.city}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-44 flex-1">
              <label
                htmlFor="home-near"
                className="block text-xs font-medium text-slate-600"
              >
                Near a campus
              </label>
              <select
                id="home-near"
                name="near"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
              >
                <option value="">Anywhere</option>
                {campuses.map((campus) => (
                  <option key={campus.slug} value={campus.slug}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-32">
              <label
                htmlFor="home-budget"
                className="block text-xs font-medium text-slate-600"
              >
                Budget (₹)
              </label>
              <input
                id="home-budget"
                name="budget"
                inputMode="numeric"
                placeholder="15000"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Recently verified
            </h2>
            <Link href="/search" className="text-sm text-slate-600 hover:underline">
              Browse all
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((listing) => (
              <ListingCard key={listing.id} listing={listing} showDistance={false} />
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            How this works
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <Step
              n={1}
              title="Search and shortlist"
              body="Filter by campus proximity, budget, room sharing and the safety provisions that matter to you."
            />
            <Step
              n={2}
              title="We confirm, then advise"
              body="A relationship manager re-checks availability and pricing with the operator, then walks you through two or three genuine options."
            />
            <Step
              n={3}
              title="Book with the details settled"
              body="Move-in terms, deposit and house rules agreed up front. We stay your point of contact afterwards."
            />
          </div>
        </div>
      </section>

      {byCity.size > 0 && (
        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Popular campuses
            </h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-3">
              {[...byCity.entries()].map(([city, list]) => (
                <div key={city}>
                  <p className="text-sm font-semibold text-slate-900">{city}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {list.map((campus) => (
                      <li key={campus.slug}>
                        <Link
                          href={`/near/${campus.slug}`}
                          className="text-slate-600 hover:text-slate-900 hover:underline"
                        >
                          Stays near {campus.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-medium text-white">
        {n}
      </span>
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

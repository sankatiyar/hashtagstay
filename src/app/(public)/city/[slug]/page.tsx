import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ListingCard } from '@/components/public/listing-card';
import { format, money } from '@/lib/money';
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, pageTitle } from '@/lib/seo';
import {
  listLiveCities,
  listPublishedInstitutions,
  searchListings,
} from '@/lib/services/public-search';

/**
 * City landing page.
 *
 * Cities are matched by slug rather than stored with one, because the city is
 * free text on a property and slugging it here keeps a single source of truth.
 * "Delhi NCR" becomes `delhi-ncr`, and the match is done by comparing slugs so
 * casing and spacing in the data cannot break the URL.
 */
export const revalidate = 900;

const citySlug = (city: string) => city.toLowerCase().replaceAll(' ', '-');

export async function generateStaticParams() {
  const cities = await listLiveCities();
  return cities.map((entry) => ({ slug: citySlug(entry.city) }));
}

/** Resolve a slug back to the stored city name. */
async function resolveCity(slug: string): Promise<string | null> {
  const cities = await listLiveCities();
  return cities.find((entry) => citySlug(entry.city) === slug)?.city ?? null;
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const city = await resolveCity(slug);
  if (!city) return { title: pageTitle('City not found'), robots: { index: false } };

  const { total } = await searchListings({ city, pageSize: 1 });

  return {
    title: pageTitle(`Co-living and student housing in ${city}`),
    description:
      `${total} verified co-living, PG and student housing options in ${city}. ` +
      'Compare rent, room sharing and safety provisions, then book with a relationship manager.',
    alternates: { canonical: absoluteUrl(`/city/${slug}`) },
  };
}

export default async function CityPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const city = await resolveCity(slug);
  if (!city) notFound();

  const [{ rows, total }, campuses] = await Promise.all([
    searchListings({ city, pageSize: 24 }),
    listPublishedInstitutions(),
  ]);

  const cityCampuses = campuses.filter((campus) => campus.city === city);

  const cheapest = rows.reduce<number | null>(
    (min, row) => (min === null ? row.fromRentMinor : Math.min(min, row.fromRentMinor)),
    null,
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <script
        {...jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: city, path: `/city/${slug}` },
          ]),
        )}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <Link href="/search" className="hover:underline">
          Stays
        </Link>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        Co-living and student housing in {city}
      </h1>
      <p className="mt-2 max-w-2xl leading-relaxed text-slate-600">
        {total} verified {total === 1 ? 'stay' : 'stays'} in {city}
        {cheapest !== null && (
          <>
            , from <strong>{format(money(cheapest, 'INR'))}</strong> per month
          </>
        )}
        . Every listing states which checks we completed and when they expire.
      </p>

      {cityCampuses.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">Search near a campus</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {cityCampuses.map((campus) => (
              <li key={campus.slug}>
                <Link
                  href={`/near/${campus.slug}`}
                  className="inline-block rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                >
                  {campus.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="font-medium text-slate-800">
            No verified inventory in {city} yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            We onboard operators city by city and verify each property before it appears
            here.{' '}
            <Link href="/enquiry" className="text-slate-900 underline">
              Tell us what you need
            </Link>{' '}
            and a relationship manager will look on your behalf.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((listing) => (
              <ListingCard key={listing.id} listing={listing} showDistance={false} />
            ))}
          </div>

          {total > rows.length && (
            <Link
              href={`/search?city=${encodeURIComponent(city)}`}
              className="mt-6 inline-block rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              See all {total} stays in {city}
            </Link>
          )}
        </>
      )}
    </main>
  );
}

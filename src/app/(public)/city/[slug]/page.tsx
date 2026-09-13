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
  const womenOnly = rows.filter((row) => row.genderPolicy === 'female_only').length;

  return (
    <main>
      <script
        {...jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: city, path: `/city/${slug}` },
          ]),
        )}
      />

      <section className="border-line relative overflow-hidden border-b">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_22rem_at_85%_0%,var(--color-marigold-100),transparent_65%)]"
        />
        <div className="container-page relative py-14">
          <nav aria-label="Breadcrumb" className="text-ink-soft text-sm">
            <Link href="/search" className="hover:text-ink">
              Stays
            </Link>{' '}
            / <span className="text-ink">{city}</span>
          </nav>
          <h1 className="font-display text-pine-950 mt-4 max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Co-living and student housing in {city}
          </h1>
          <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
            Every listing states which checks we completed and when they expire — and a
            relationship manager re-confirms the bed before you pay anything.
          </p>

          <dl className="mt-8 flex flex-wrap gap-3">
            <Pill label="verified stays" value={String(total)} />
            {cheapest !== null && (
              <Pill
                label="lowest rent / month"
                value={format(money(cheapest, 'INR'))}
              />
            )}
            {womenOnly > 0 && <Pill label="women-only" value={String(womenOnly)} />}
            {cityCampuses.length > 0 && (
              <Pill label="campuses mapped" value={String(cityCampuses.length)} />
            )}
          </dl>

          {cityCampuses.length > 0 && (
            <div className="mt-8">
              <p className="label">Search near a campus</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {cityCampuses.map((campus) => (
                  <li key={campus.slug}>
                    <Link href={`/near/${campus.slug}`} className="chip">
                      {campus.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <div className="container-page py-12">
        {rows.length === 0 ? (
          <div className="card px-6 py-16 text-center">
            <p className="font-display text-ink text-2xl font-semibold">
              No verified inventory in {city} yet
            </p>
            <p className="text-ink-soft mx-auto mt-2 max-w-md">
              We verify each property before it appears here. Tell us what you need and
              a relationship manager will look on your behalf.
            </p>
            <Link
              href={`/enquiry?city=${encodeURIComponent(city)}`}
              className="btn-primary mt-6"
            >
              Find me a stay
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((listing) => (
                <ListingCard key={listing.id} listing={listing} showDistance={false} />
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              {total > rows.length && (
                <Link
                  href={`/search?city=${encodeURIComponent(city)}`}
                  className="btn-secondary"
                >
                  See all {total} stays in {city}
                </Link>
              )}
              <Link
                href={`/enquiry?city=${encodeURIComponent(city)}`}
                className="btn-primary"
              >
                Get help choosing in {city}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line flex items-baseline gap-2 rounded-full border bg-white px-4 py-2 shadow-(--shadow-card)">
      <dd className="font-display text-pine-900 text-lg font-semibold">{value}</dd>
      <dt className="text-ink-soft text-sm">{label}</dt>
    </div>
  );
}

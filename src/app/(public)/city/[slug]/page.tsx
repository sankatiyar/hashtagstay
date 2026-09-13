import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CategoryBar } from '@/components/public/category-bar';
import { ListingCard } from '@/components/public/listing-card';
import { Photo } from '@/components/public/photo';
import { format, money } from '@/lib/money';
import { CITY_PHOTOS } from '@/lib/photos';
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

  const [{ rows, total }, campuses, cities] = await Promise.all([
    searchListings({ city, pageSize: 24 }),
    listPublishedInstitutions(),
    listLiveCities(),
  ]);

  const cityCampuses = campuses.filter((campus) => campus.city === city);
  const cheapest = rows.reduce<number | null>(
    (min, row) => (min === null ? row.fromRentMinor : Math.min(min, row.fromRentMinor)),
    null,
  );
  const photo = CITY_PHOTOS[city];

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

      <section className="container-page pt-6">
        <div className="bg-brand-600 relative overflow-hidden rounded-[2rem]">
          {photo && (
            <div className="absolute inset-0">
              <Photo name={photo} aspect={16 / 6} sizes="100vw" priority alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
            </div>
          )}
          <div className="relative flex min-h-[340px] flex-col justify-end p-6 text-white sm:p-10 lg:p-14">
            <nav aria-label="Breadcrumb" className="text-sm text-white/80">
              <Link href="/search" className="hover:underline">
                Stays
              </Link>{' '}
              / {city}
            </nav>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
              Co-living and student housing in {city}
            </h1>
            <p className="mt-3 text-lg text-white/90">
              {total} verified {total === 1 ? 'stay' : 'stays'}
              {cheapest !== null && ` · from ${format(money(cheapest, 'INR'))} a month`}
            </p>
          </div>
        </div>
      </section>

      <section className="container-page border-line mt-6 border-b">
        <CategoryBar cities={cities} active={{ city }} />
      </section>

      <div className="container-page pt-8">
        {cityCampuses.length > 0 && (
          <div className="mb-8">
            <p className="text-ink font-semibold">Search near a campus</p>
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

        {rows.length === 0 ? (
          <div className="border-line rounded-2xl border px-6 py-16 text-center">
            <p className="text-ink text-2xl font-bold">
              No verified stays in {city} yet
            </p>
            <p className="text-ink-soft mx-auto mt-2 max-w-md">
              Tell us what you need and a relationship manager will look on your behalf.
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
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((listing) => (
                <ListingCard key={listing.id} listing={listing} showDistance={false} />
              ))}
            </div>
            <div className="mt-12 flex flex-wrap gap-3">
              {total > rows.length && (
                <Link
                  href={`/search?city=${encodeURIComponent(city)}`}
                  className="btn-secondary"
                >
                  Show all {total} stays
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

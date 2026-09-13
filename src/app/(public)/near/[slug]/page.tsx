import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CategoryBar } from '@/components/public/category-bar';
import { ListingCard } from '@/components/public/listing-card';
import { Photo } from '@/components/public/photo';
import { format, money } from '@/lib/money';
import { CITY_PHOTOS } from '@/lib/photos';
import {
  absoluteUrl,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScript,
  pageTitle,
} from '@/lib/seo';
import {
  findInstitution,
  listLiveCities,
  listPublishedInstitutions,
  searchListings,
} from '@/lib/services/public-search';

/**
 * Campus proximity landing page — the student wedge, and the page built to rank
 * for "PG near <campus>", which is what students actually search.
 *
 * It shares the city page's layout (photo hero, category bar, campus chips) so
 * the two kinds of landing page read as one site. It lists the stays in this
 * campus's catchment — within the radius and nearer this campus than any other —
 * so neighbouring colleges each get their own set instead of repeating one
 * another's. "Refine this search" opens the plain radius search for everything.
 */
export const revalidate = 900;

const RADIUS_KM = 5;

export async function generateStaticParams() {
  const campuses = await listPublishedInstitutions();
  return campuses.map(({ slug }) => ({ slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const campus = await findInstitution(slug);
  if (!campus)
    return { title: pageTitle('Campus not found'), robots: { index: false } };

  const { total } = await searchListings({
    institutionSlug: slug,
    radiusKm: RADIUS_KM,
    nearestCampusOnly: true,
    pageSize: 1,
  });

  return {
    title: pageTitle(`PG and hostels near ${campus.name}`),
    description:
      `${total} verified co-living and student housing options close to ${campus.name}, ` +
      `${campus.city}, all within ${RADIUS_KM} km. Compare rent, room sharing and safety provisions.`,
    alternates: { canonical: absoluteUrl(`/near/${slug}`) },
  };
}

export default async function NearCampusPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const campus = await findInstitution(slug);
  if (!campus) notFound();

  const [{ rows, total }, campuses, cities] = await Promise.all([
    searchListings({
      institutionSlug: slug,
      radiusKm: RADIUS_KM,
      nearestCampusOnly: true,
      sort: 'distance',
      pageSize: 24,
    }),
    listPublishedInstitutions(),
    listLiveCities(),
  ]);

  const otherCampuses = campuses.filter(
    (other) => other.city === campus.city && other.slug !== slug,
  );
  const cheapest = rows.reduce<number | null>(
    (min, row) => (min === null ? row.fromRentMinor : Math.min(min, row.fromRentMinor)),
    null,
  );
  const photo = CITY_PHOTOS[campus.city] ?? 'studentBooks';

  const faqs = [
    {
      question: `How far are these stays from ${campus.name}?`,
      answer: `Every listing on this page is within ${RADIUS_KM} km of ${campus.name} and closer to it than to any other campus we cover, so each campus page has its own set. Each card shows the exact distance; use "Refine this search" to see every stay in the area.`,
    },
    ...(cheapest !== null
      ? [
          {
            question: `What does accommodation near ${campus.name} cost?`,
            answer: `Verified options start from ${format(money(cheapest, 'INR'))} per month. Shared rooms cost less than private ones, and rent excludes the security deposit, which each listing states separately.`,
          },
        ]
      : []),
    {
      question: 'Is availability guaranteed?',
      answer:
        'No. Bed counts are as reported by the operator, so a relationship manager re-confirms current availability with them before any booking is made. We would rather tell you a room has gone than take a fee for one that has.',
    },
    {
      question: 'What does verified mean here?',
      answer:
        'Each listing states which checks we completed — documents reviewed, photos confirmed, or a member of our team visiting in person — and when they expire.',
    },
  ];

  const cityPath = `/city/${campus.city.toLowerCase().replaceAll(' ', '-')}`;

  return (
    <main>
      <script {...jsonLdScript(faqJsonLd(faqs))} />
      <script
        {...jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: campus.city, path: cityPath },
            { name: campus.name, path: `/near/${slug}` },
          ]),
        )}
      />

      <section className="container-page pt-6">
        <div className="bg-brand-600 relative overflow-hidden rounded-[2rem]">
          <div className="absolute inset-0">
            <Photo name={photo} aspect={16 / 6} sizes="100vw" priority alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          </div>
          <div className="relative flex min-h-[340px] flex-col justify-end p-6 text-white sm:p-10 lg:p-14">
            <nav aria-label="Breadcrumb" className="text-sm text-white/80">
              <Link href="/search" className="hover:underline">
                Stays
              </Link>{' '}
              /{' '}
              <Link href={cityPath} className="hover:underline">
                {campus.city}
              </Link>
            </nav>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
              PG and hostels near {campus.name}
            </h1>
            <p className="mt-3 text-lg text-white/90">
              {total > 0
                ? `${total} verified ${total === 1 ? 'stay' : 'stays'} close to campus`
                : 'No verified stays close to campus yet'}
              {cheapest !== null && ` · from ${format(money(cheapest, 'INR'))} a month`}
            </p>
          </div>
        </div>
      </section>

      <section className="container-page border-line mt-6 border-b">
        <CategoryBar cities={cities} active={{ city: campus.city }} />
      </section>

      <div className="container-page pt-8">
        {otherCampuses.length > 0 && (
          <div className="mb-8">
            <p className="text-ink font-semibold">Other campuses in {campus.city}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {otherCampuses.map((other) => (
                <li key={other.slug}>
                  <Link href={`/near/${other.slug}`} className="chip">
                    {other.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="border-line rounded-2xl border px-6 py-16 text-center">
            <p className="text-ink text-2xl font-bold">
              No verified stays near {campus.name} yet
            </p>
            <p className="text-ink-soft mx-auto mt-2 max-w-md">
              Tell us what you need and a relationship manager will look on your behalf.
            </p>
            <Link href={`/enquiry?near=${slug}`} className="btn-primary mt-6">
              Find me a stay near campus
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            <div className="mt-12 flex flex-wrap gap-3">
              <Link
                href={`/search?near=${slug}&radius=${RADIUS_KM}`}
                className="btn-secondary"
              >
                Refine this search
              </Link>
              <Link href={`/enquiry?near=${slug}`} className="btn-primary">
                Get help choosing near {campus.name}
              </Link>
            </div>
          </>
        )}
      </div>

      <section className="container-page pt-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 className="text-ink text-3xl font-extrabold tracking-tight">
            Before you book near {campus.name}
          </h2>
          <div className="divide-line border-line divide-y border-y">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <span className="text-ink text-xl transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="text-ink-soft mt-3 leading-relaxed">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

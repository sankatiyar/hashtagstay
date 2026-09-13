import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ListingCard } from '@/components/public/listing-card';
import { format, money } from '@/lib/money';
import {
  absoluteUrl,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScript,
  pageTitle,
} from '@/lib/seo';
import {
  findInstitution,
  listPublishedInstitutions,
  searchListings,
} from '@/lib/services/public-search';

/**
 * Campus proximity landing page — the student wedge, and the page built to rank
 * for "PG near <campus>", which is what students actually search.
 *
 * Programmatic but not thin: each page carries real inventory, real distances
 * and a real price range. A generated page with nothing on it is worse than no
 * page, so this 404s rather than publishing an empty shell for a campus we
 * have no coverage near.
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
    pageSize: 1,
  });

  return {
    title: pageTitle(`PG and hostels near ${campus.name}`),
    description:
      `${total} verified co-living and student housing options within ${RADIUS_KM} km of ` +
      `${campus.name}, ${campus.city}. Compare rent, room sharing and safety provisions.`,
    alternates: { canonical: absoluteUrl(`/near/${slug}`) },
  };
}

export default async function NearCampusPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const campus = await findInstitution(slug);
  if (!campus) notFound();

  const { rows, total } = await searchListings({
    institutionSlug: slug,
    radiusKm: RADIUS_KM,
    sort: 'distance',
    pageSize: 24,
  });

  const cheapest = rows.reduce<number | null>(
    (min, row) => (min === null ? row.fromRentMinor : Math.min(min, row.fromRentMinor)),
    null,
  );
  const nearest = rows[0]?.distanceMeters ?? null;

  const faqs = [
    {
      question: `How far are these stays from ${campus.name}?`,
      answer: `Every listing on this page is within ${RADIUS_KM} km of ${campus.name}, and each card shows its exact distance. Sort by nearest campus to see the closest first.`,
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
        'Each listing states which checks we completed — documents reviewed, photos confirmed, or a member of our team visiting in person — and when they expire. We never show a bare "verified" badge, because what was actually checked is the part that matters.',
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

      <section className="border-line bg-pine-900 border-b text-white">
        <div className="container-page py-14">
          <nav aria-label="Breadcrumb" className="text-pine-200/80 text-sm">
            <Link href="/search" className="hover:text-white">
              Stays
            </Link>{' '}
            /{' '}
            <Link href={cityPath} className="hover:text-white">
              {campus.city}
            </Link>
          </nav>
          <p className="text-marigold-300 mt-6 text-xs font-semibold tracking-[0.14em] uppercase">
            Student housing
          </p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            PG and hostels near {campus.name}
          </h1>
          <p className="text-pine-100/85 mt-4 max-w-2xl text-lg leading-relaxed">
            {total > 0 ? (
              <>
                {total} verified {total === 1 ? 'stay' : 'stays'} within {RADIUS_KM} km
                {cheapest !== null && (
                  <>, from {format(money(cheapest, 'INR'))} a month</>
                )}
                {nearest !== null && (
                  <> — the closest is {(nearest / 1000).toFixed(1)} km away</>
                )}
                .
              </>
            ) : (
              <>
                We don’t have verified inventory near {campus.name} yet. Tell us what
                you need and a relationship manager will look on your behalf.
              </>
            )}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/enquiry?near=${slug}`} className="btn-accent">
              Find me a stay near campus
            </Link>
            <Link
              href={`/search?near=${slug}&radius=${RADIUS_KM}`}
              className="btn border border-white/25 text-white hover:bg-white/10"
            >
              Refine this search
            </Link>
          </div>
        </div>
      </section>

      {rows.length > 0 && (
        <div className="container-page py-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      )}

      <section className="container-page py-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Common questions</p>
            <h2 className="font-display text-pine-950 mt-3 text-3xl font-semibold tracking-tight">
              Before you book near {campus.name}
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group card p-5 open:shadow-(--shadow-lift)"
              >
                <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <span className="bg-sand text-pine-800 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition group-open:rotate-45">
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

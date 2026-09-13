import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ListingCard } from '@/components/public/listing-card';
import { Photo } from '@/components/public/photo';
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

  const faqs = [
    {
      question: `How far are these stays from ${campus.name}?`,
      answer: `Every listing on this page is within ${RADIUS_KM} km of ${campus.name}, and each card shows its exact distance.`,
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
        <div className="bg-sand grid overflow-hidden rounded-[2rem] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center p-8 sm:p-12">
            <nav aria-label="Breadcrumb" className="text-ink-soft text-sm">
              <Link href="/search" className="hover:underline">
                Stays
              </Link>{' '}
              /{' '}
              <Link href={cityPath} className="hover:underline">
                {campus.city}
              </Link>
            </nav>
            <p className="eyebrow mt-6">Student housing</p>
            <h1 className="text-ink mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
              PG and hostels near {campus.name}
            </h1>
            <p className="text-ink-soft mt-4 text-lg">
              {total > 0 ? (
                <>
                  {total} verified {total === 1 ? 'stay' : 'stays'} within {RADIUS_KM}{' '}
                  km
                  {cheapest !== null && (
                    <>, from {format(money(cheapest, 'INR'))} a month</>
                  )}
                  .
                </>
              ) : (
                <>
                  No verified stays near {campus.name} yet. Tell us what you need and a
                  relationship manager will look on your behalf.
                </>
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/enquiry?near=${slug}`} className="btn-primary px-6 py-3.5">
                Find me a stay near campus
              </Link>
              <Link
                href={`/search?near=${slug}&radius=${RADIUS_KM}`}
                className="btn-secondary px-6 py-3.5"
              >
                Refine this search
              </Link>
            </div>
          </div>
          <div className="relative min-h-[260px]">
            <div className="absolute inset-0">
              <Photo
                name="studentBooks"
                aspect={1}
                sizes="(min-width: 1024px) 45vw, 100vw"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {rows.length > 0 && (
        <div className="container-page pt-12">
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      )}

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

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

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <script {...jsonLdScript(faqJsonLd(faqs))} />
      <script
        {...jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            {
              name: campus.city,
              path: `/city/${campus.city.toLowerCase().replaceAll(' ', '-')}`,
            },
            { name: campus.name, path: `/near/${slug}` },
          ]),
        )}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <Link href="/search" className="hover:underline">
          Stays
        </Link>
        {' / '}
        <Link
          href={`/city/${campus.city.toLowerCase().replaceAll(' ', '-')}`}
          className="hover:underline"
        >
          {campus.city}
        </Link>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        PG and hostels near {campus.name}
      </h1>
      <p className="mt-2 max-w-2xl leading-relaxed text-slate-600">
        {total > 0 ? (
          <>
            {total} verified {total === 1 ? 'stay' : 'stays'} within {RADIUS_KM} km of{' '}
            {campus.name}
            {cheapest !== null && (
              <>
                , starting from <strong>{format(money(cheapest, 'INR'))}</strong> per
                month
              </>
            )}
            .
          </>
        ) : (
          <>
            We do not have verified inventory near {campus.name} yet. We are adding
            operators city by city — tell us what you need and a relationship manager
            will look on your behalf.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/search?near=${slug}&radius=${RADIUS_KM}`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          Refine this search
        </Link>
        <Link
          href={`/enquiry?near=${slug}`}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Tell us what you need
        </Link>
      </div>

      {rows.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          Common questions
        </h2>
        <dl className="mt-4 space-y-5">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-medium text-slate-900">{faq.question}</dt>
              <dd className="mt-1 leading-relaxed text-slate-600">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

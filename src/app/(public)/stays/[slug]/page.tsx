import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { toggleWishlistAction } from '@/app/(public)/account/actions';
import { Icon, type IconName } from '@/components/public/icons';
import { ListingCover } from '@/components/public/listing-cover';
import { ViewBeacon } from '@/components/public/view-beacon';
import { WishlistButton } from '@/components/public/wishlist-button';
import { genderPolicyLabel, propertyTypeLabel } from '@/components/ui/badge';
import { formatDistance } from '@/lib/geo';
import { format, money } from '@/lib/money';
import {
  absoluteUrl,
  breadcrumbJsonLd,
  jsonLdScript,
  listingJsonLd,
  pageTitle,
} from '@/lib/seo';
import { listPhotos } from '@/lib/services/media';
import {
  getPublicListing,
  listLiveListingSlugs,
  nearbyInstitutions,
} from '@/lib/services/public-search';
import { publishedReviews } from '@/lib/services/reviews';
import { resolveAmenities, resolveHouseRules } from '@/lib/taxonomy/amenities';
import { isExpired, isoDate } from '@/lib/time';
import {
  TIER_LABELS,
  TIER_RESIDENT_FACING,
  type VerificationTier,
} from '@/lib/verification/rubric';

/**
 * Public listing detail — the primary SEO landing page.
 *
 * Statically generated for real listings and revalidated, because this is the
 * page that has to rank and has to be fast. Rent and availability change, so
 * the window is short rather than indefinite.
 *
 * Generated sample listings (over a thousand, slugs ending `-sample`) are left
 * to render on their first request and are then cached the same way.
 * Prerendering them all pushed a build towards the better part of an hour, for
 * pages that exist only to demonstrate the product.
 */
export const revalidate = 600;

export async function generateStaticParams() {
  const slugs = await listLiveListingSlugs();
  return slugs
    .filter(({ slug }) => !slug.endsWith('-sample'))
    .map(({ slug }) => ({ slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const listing = await getPublicListing(slug);

  if (!listing) {
    return { title: pageTitle('Stay not found'), robots: { index: false } };
  }

  const cheapest = listing.rooms[0];
  const where = [listing.locality, listing.city].filter(Boolean).join(', ');
  const price = cheapest
    ? ` from ${format(money(cheapest.rentAmountMinor, 'INR'))}/month`
    : '';

  return {
    title: pageTitle(`${listing.name}, ${where}`),
    description:
      `${propertyTypeLabel(listing.propertyType)} in ${where}${price}. ` +
      `${genderPolicyLabel(listing.genderPolicy)}. ` +
      'Verified by Sandy Stays — see exactly which checks we completed.',
    alternates: { canonical: absoluteUrl(`/stays/${listing.slug}`) },
    openGraph: {
      title: `${listing.name}, ${where}`,
      description: listing.description ?? undefined,
      url: absoluteUrl(`/stays/${listing.slug}`),
      type: 'website',
    },
  };
}

export default async function ListingPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const listing = await getPublicListing(slug);

  // Anything not live 404s rather than staying reachable by URL.
  if (!listing) notFound();

  const location = listing.location
    ? { lat: listing.location.y, lng: listing.location.x }
    : null;
  const [campuses, photos, reviewSummary] = await Promise.all([
    nearbyInstitutions(location),
    listPhotos(listing.id, { publicOnly: true }),
    publishedReviews(listing.id),
  ]);

  const amenities = resolveAmenities(listing.amenities);
  const rules = resolveHouseRules(listing.houseRules);
  const cheapest = listing.rooms[0];
  const badgeExpired = isExpired(listing.verificationExpiresAt);
  const tier = listing.verificationTier as VerificationTier;
  const place = [listing.locality, listing.city].filter(Boolean).join(', ');
  const cityPath = `/city/${listing.city.toLowerCase().replaceAll(' ', '-')}`;
  const bedsFree = listing.rooms.reduce((sum, room) => sum + (room.bedsFree ?? 0), 0);
  const minStay = Math.min(...listing.rooms.map((r) => r.minTenureMonths));
  const isSample = listing.slug.endsWith('-sample');

  const highlights: [IconName, string, string][] = [
    [
      'shield',
      badgeExpired
        ? `${TIER_LABELS[tier]} — due for renewal`
        : (TIER_LABELS[tier] ?? 'Not yet verified'),
      badgeExpired
        ? 'This check has lapsed. We re-confirm the details with the operator before any booking.'
        : `${TIER_RESIDENT_FACING[tier] ?? TIER_RESIDENT_FACING.none}${listing.verificationExpiresAt ? ` Valid until ${isoDate(listing.verificationExpiresAt)}.` : ''}`,
    ],
    [
      'bed',
      bedsFree > 0
        ? `${bedsFree} ${bedsFree === 1 ? 'bed' : 'beds'} reported free`
        : 'Availability on request',
      'Counts come from the operator. Your relationship manager re-confirms before you commit.',
    ],
    [
      'lock',
      'Pay nothing until your bed is confirmed',
      'The operator confirms first. Your number is never shared with them.',
    ],
  ];

  return (
    <main className="pb-28 lg:pb-8">
      <script
        {...jsonLdScript(
          listingJsonLd({
            ...listing,
            fromRentMinor: cheapest?.rentAmountMinor ?? null,
            currency: 'INR',
          }),
        )}
      />
      <script
        {...jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: listing.city, path: cityPath },
            { name: listing.name, path: `/stays/${listing.slug}` },
          ]),
        )}
      />
      <ViewBeacon propertyId={listing.id} />

      <div className="mx-auto max-w-[1180px] px-5 pt-8 sm:px-10">
        <h1 className="text-ink text-2xl font-bold tracking-tight sm:text-[1.75rem]">
          {listing.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-ink flex flex-wrap items-center gap-x-2">
            {reviewSummary.count > 0 && (
              <>
                <span className="flex items-center gap-1 font-semibold">
                  <Icon name="star" filled strokeWidth={0} className="h-3.5 w-3.5" />
                  {reviewSummary.average?.toFixed(1)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="underline">{reviewSummary.count} reviews</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <Link href={cityPath} className="font-semibold underline">
              {place}
            </Link>
          </p>
          <Link
            href="#rooms"
            className="text-ink hover:bg-sand flex items-center gap-2 rounded-lg px-2 py-1.5 font-semibold underline"
          >
            <Icon name="bed" className="h-4 w-4" /> See rooms
          </Link>
        </div>

        {/* Gallery */}
        <div className="relative mt-6 grid h-[300px] gap-2 overflow-hidden rounded-2xl sm:h-[420px] sm:grid-cols-4 sm:grid-rows-2">
          <div className="sm:col-span-2 sm:row-span-2">
            <ListingCover
              seed={listing.slug}
              photoUrl={photos[0]?.url}
              alt={photos[0]?.altText ?? `${listing.name}, ${place}`}
            />
          </div>
          {[1, 2, 3, 4].map((index) => (
            <div key={index} className="hidden overflow-hidden sm:block">
              <ListingCover
                seed={`${listing.slug}-${index}`}
                photoUrl={photos[index]?.url}
                alt={photos[index]?.altText ?? `${listing.name} photo ${index + 1}`}
                className="transition duration-300 hover:brightness-90"
              />
            </div>
          ))}
        </div>
        {(isSample || photos.length === 0) && (
          <p className="text-ink-soft mt-2 text-xs">
            {isSample
              ? 'Sample listing for demonstration — photos are representative, not of a real property.'
              : 'Illustration — the operator has not uploaded approved photos yet. Ask your relationship manager for a video tour.'}
          </p>
        )}

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-20">
          <div className="min-w-0">
            <div className="border-line border-b pb-8">
              <h2 className="text-ink text-xl font-semibold">
                {propertyTypeLabel(listing.propertyType)} in {place}
              </h2>
              <p className="text-ink mt-1">
                {listing.rooms.length} room{' '}
                {listing.rooms.length === 1 ? 'type' : 'types'} ·{' '}
                {genderPolicyLabel(listing.genderPolicy)} · from {minStay}{' '}
                {minStay === 1 ? 'month' : 'months'}
              </p>
            </div>

            <ul className="border-line space-y-6 border-b py-8">
              {highlights.map(([icon, title, body]) => (
                <li key={title} className="flex gap-5">
                  <Icon
                    name={icon}
                    className="text-brand-600 mt-0.5 h-7 w-7 shrink-0"
                    strokeWidth={1.7}
                  />
                  <div>
                    <p className="text-ink font-semibold">{title}</p>
                    <p className="text-ink-soft mt-0.5">{body}</p>
                  </div>
                </li>
              ))}
            </ul>

            {listing.description && (
              <Section title="About this stay">
                <p className="text-ink leading-relaxed whitespace-pre-line">
                  {listing.description}
                </p>
              </Section>
            )}

            <Section title="Rooms and pricing" id="rooms">
              <div className="grid gap-4 sm:grid-cols-2">
                {listing.rooms.map((room) => (
                  <div key={room.id} className="border-line rounded-2xl border p-5">
                    <Icon name="bed" className="text-ink h-7 w-7" strokeWidth={1.6} />
                    <p className="text-ink mt-4 font-semibold">{room.name}</p>
                    <p className="text-ink-soft text-sm">
                      {room.occupancy === 1
                        ? 'Private room'
                        : `${room.occupancy} sharing`}
                      {room.hasPrivateBathroom && ' · attached bathroom'}
                    </p>
                    <p className="text-ink mt-4">
                      <span className="text-lg font-bold">
                        {format(money(room.rentAmountMinor, 'INR'))}
                      </span>{' '}
                      month
                    </p>
                    <p className="text-ink-soft text-sm">
                      Deposit{' '}
                      {room.depositAmountMinor !== null
                        ? format(money(room.depositAmountMinor, 'INR'))
                        : '—'}{' '}
                      · min {room.minTenureMonths} mo
                      {(room.bedsFree ?? 0) > 0 && ` · ${room.bedsFree} free`}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            {amenities.length > 0 && (
              <Section title="What this place offers">
                <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {amenities.map((amenity) => (
                    <li key={amenity.slug} className="text-ink flex items-center gap-4">
                      <Icon
                        name={amenity.isSafetySignal ? 'shield' : 'check'}
                        className={`h-6 w-6 ${amenity.isSafetySignal ? 'text-brand-600' : 'text-ink'}`}
                        strokeWidth={1.7}
                      />
                      {amenity.label}
                      {amenity.isSafetySignal && (
                        <span className="bg-brand-50 text-brand-700 rounded-full px-2 py-0.5 text-xs font-semibold">
                          Safety
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {campuses.length > 0 && (
              <Section title="Nearby campuses">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {campuses.map((campus) => (
                    <li key={campus.slug}>
                      <Link
                        href={`/near/${campus.slug}`}
                        className="border-line hover:border-ink flex items-center justify-between gap-3 rounded-2xl border p-4 transition"
                      >
                        <span className="text-ink flex items-center gap-3 font-semibold">
                          <Icon name="cap" className="text-brand-600 h-5 w-5" />
                          {campus.name}
                        </span>
                        <span className="text-ink-soft shrink-0 text-sm">
                          {formatDistance(campus.distanceMeters)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {rules.length > 0 && (
              <Section title="House rules">
                <ul className="flex flex-wrap gap-2">
                  {rules.map((rule) => (
                    <li
                      key={rule.slug}
                      className="border-line text-ink rounded-full border px-4 py-2 text-sm"
                    >
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section
              title={
                reviewSummary.count > 0
                  ? `★ ${reviewSummary.average?.toFixed(1)} · ${reviewSummary.count} reviews`
                  : 'Reviews'
              }
            >
              {reviewSummary.count === 0 ? (
                <p className="text-ink-soft">
                  No reviews yet. Only residents who booked through Sandy Stays and
                  moved in can review, so there are no anonymous ones.
                </p>
              ) : (
                <ul className="grid gap-8 sm:grid-cols-2">
                  {reviewSummary.reviews.slice(0, 10).map((review) => (
                    <li key={review.id}>
                      <div className="flex items-center gap-3">
                        <span className="bg-brand-600 flex h-11 w-11 items-center justify-center rounded-full font-bold text-white">
                          {review.residentName.slice(0, 1)}
                        </span>
                        <div>
                          <p className="text-ink font-semibold">
                            {review.residentName}
                          </p>
                          <p className="text-ink-soft text-sm">
                            Verified stay · {review.createdAt.toISOString().slice(0, 7)}
                          </p>
                        </div>
                      </div>
                      <p
                        className="text-ink mt-3 text-sm"
                        aria-label={`${review.rating} out of 5`}
                      >
                        {'★'.repeat(review.rating)}
                        <span className="text-line">
                          {'★'.repeat(5 - review.rating)}
                        </span>
                        {review.title && (
                          <span className="ml-2 font-semibold">{review.title}</span>
                        )}
                      </p>
                      <p className="text-ink mt-1 leading-relaxed">{review.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* Booking panel */}
          <aside className="hidden lg:block">
            {/* Opaque, and holding every control in the panel: a transparent
                sticky card let the content scrolling beneath it show through. */}
            <div className="border-line sticky top-28 z-10 rounded-2xl border bg-white p-6 shadow-(--shadow-lift)">
              {cheapest && (
                <p className="text-ink">
                  {listing.rooms.length > 1 && (
                    <span className="text-ink-soft">From </span>
                  )}
                  <span className="text-2xl font-bold">
                    {format(money(cheapest.rentAmountMinor, 'INR'))}
                  </span>{' '}
                  month
                </p>
              )}

              <div className="mt-5 overflow-hidden rounded-xl border border-[#b8b1ab]">
                <div className="grid grid-cols-2">
                  <Field label="Room" value={cheapest?.name ?? '—'} />
                  <Field
                    label="Min stay"
                    value={`${minStay} ${minStay === 1 ? 'month' : 'months'}`}
                    border
                  />
                </div>
                <div className="border-t border-[#b8b1ab]">
                  <Field
                    label="Availability"
                    value={
                      bedsFree > 0
                        ? `${bedsFree} ${bedsFree === 1 ? 'bed' : 'beds'} reported free`
                        : 'Confirmed on request'
                    }
                  />
                </div>
              </div>

              <Link
                href={`/enquiry?listing=${listing.slug}`}
                className="btn-primary mt-4 w-full py-3.5 text-base"
              >
                Check availability
              </Link>
              <p className="text-ink-soft mt-3 text-center text-sm">
                You won’t be charged yet
              </p>

              <div className="mt-4">
                {/* Rendered signed-in so the page stays statically generated; the
                    action tells a signed-out visitor to sign in. */}
                <WishlistButton
                  propertyId={listing.id}
                  saved={false}
                  signedIn
                  action={toggleWishlistAction}
                  returnTo={`/stays/${listing.slug}`}
                />
              </div>

              <dl className="border-line text-ink mt-5 space-y-3 border-t pt-5">
                <div className="flex justify-between">
                  <dt className="underline">Rent, paid to operator</dt>
                  <dd>
                    {cheapest ? format(money(cheapest.rentAmountMinor, 'INR')) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="underline">Refundable deposit</dt>
                  <dd>
                    {cheapest?.depositAmountMinor != null
                      ? format(money(cheapest.depositAmountMinor, 'INR'))
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="underline">Sandy Stays booking fee</dt>
                  <dd className="text-ink-soft">shown before you pay</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile booking bar */}
      <div className="border-line fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t bg-white px-5 py-4 lg:hidden">
        <p className="text-ink">
          {cheapest && (
            <>
              <span className="font-bold">
                {format(money(cheapest.rentAmountMinor, 'INR'))}
              </span>{' '}
              month
            </>
          )}
          <span className="text-ink-soft block text-xs">You won’t be charged yet</span>
        </p>
        <Link
          href={`/enquiry?listing=${listing.slug}`}
          className="btn-primary px-6 py-3"
        >
          Check availability
        </Link>
      </div>
    </main>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-line scroll-mt-28 border-b py-10 last:border-b-0"
    >
      <h2 className="text-ink mb-6 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  border = false,
}: {
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <div className={`px-3.5 py-2.5 ${border ? 'border-l border-[#b8b1ab]' : ''}`}>
      <p className="text-ink text-[10px] font-bold tracking-wide uppercase">{label}</p>
      <p className="text-ink truncate text-sm">{value}</p>
    </div>
  );
}

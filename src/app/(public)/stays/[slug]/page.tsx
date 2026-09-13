import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { toggleWishlistAction } from '@/app/(public)/account/actions';
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
 * Statically generated for known listings and revalidated, because this is the
 * page that has to rank and has to be fast. Rent and availability change, so
 * the window is short rather than indefinite.
 */
export const revalidate = 600;

const TIER_ORDER: VerificationTier[] = [
  'documents_checked',
  'photos_verified',
  'onground_audited',
];

export async function generateStaticParams() {
  const slugs = await listLiveListingSlugs();
  return slugs.map(({ slug }) => ({ slug }));
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
      'Verified by HashtagStay — see exactly which checks we completed.',
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
  const safety = amenities.filter((a) => a.isSafetySignal);
  const comfort = amenities.filter((a) => !a.isSafetySignal);
  const rules = resolveHouseRules(listing.houseRules);

  const cheapest = listing.rooms[0];
  const badgeExpired = isExpired(listing.verificationExpiresAt);
  const tier = listing.verificationTier as VerificationTier;
  const tierRank = TIER_ORDER.indexOf(tier);
  const place = [listing.locality, listing.city].filter(Boolean).join(', ');
  const cityPath = `/city/${listing.city.toLowerCase().replaceAll(' ', '-')}`;
  const bedsFree = listing.rooms.reduce((sum, room) => sum + (room.bedsFree ?? 0), 0);

  return (
    <main className="pb-8">
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

      <div className="container-page pt-6">
        <nav
          aria-label="Breadcrumb"
          className="text-ink-soft flex items-center gap-2 text-sm"
        >
          <Link href="/search" className="hover:text-ink">
            Stays
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={cityPath} className="hover:text-ink">
            {listing.city}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink truncate">{listing.name}</span>
        </nav>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">
              {propertyTypeLabel(listing.propertyType)} ·{' '}
              {genderPolicyLabel(listing.genderPolicy)}
            </p>
            <h1 className="font-display text-pine-950 mt-2 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
              {listing.name}
            </h1>
            <p className="text-ink-soft mt-2">
              {listing.addressLine1}, {place}
              {listing.postalCode ? ` ${listing.postalCode}` : ''}
            </p>
          </div>
          {reviewSummary.count > 0 && (
            <p className="text-ink flex items-center gap-2 text-sm">
              <span className="text-marigold-500">★</span>
              <strong>{reviewSummary.average?.toFixed(1)}</strong>
              <span className="text-ink-soft">
                · {reviewSummary.count} verified{' '}
                {reviewSummary.count === 1 ? 'stay' : 'stays'}
              </span>
            </p>
          )}
        </div>

        {/* Gallery */}
        <div className="mt-6 grid h-[280px] gap-3 overflow-hidden rounded-3xl sm:h-[440px] sm:grid-cols-4 sm:grid-rows-2">
          <div className="relative sm:col-span-2 sm:row-span-2">
            <ListingCover
              seed={listing.slug}
              photoUrl={photos[0]?.url}
              alt={photos[0]?.altText ?? `${listing.name}, ${place}`}
            />
          </div>
          {[1, 2, 3, 4].map((index) => (
            <div key={index} className="relative hidden sm:block">
              <ListingCover
                seed={`${listing.slug}-${index}`}
                photoUrl={photos[index]?.url}
                alt={photos[index]?.altText ?? `${listing.name} photo ${index + 1}`}
              />
            </div>
          ))}
        </div>
        {photos.length === 0 && (
          <p className="text-ink-soft mt-2 text-xs">
            Illustration — the operator has not uploaded approved photos yet. Ask your
            relationship manager for a video tour.
          </p>
        )}
      </div>

      <div className="container-page mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-10">
          {/* The verification claim, stated in full rather than as a bare badge. */}
          <section
            className={`rounded-3xl p-6 sm:p-8 ${badgeExpired ? 'bg-marigold-50 ring-marigold-200 ring-1' : 'bg-pine-900 text-white'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                className={`text-xs font-semibold tracking-[0.14em] uppercase ${badgeExpired ? 'text-marigold-700' : 'text-marigold-300'}`}
              >
                What we verified
              </p>
              {tierRank >= 0 && (
                <div className="flex items-center gap-1.5">
                  {TIER_ORDER.map((t, i) => (
                    <span
                      key={t}
                      className={`h-1.5 w-8 rounded-full ${i <= tierRank ? (badgeExpired ? 'bg-marigold-400' : 'bg-marigold-300') : badgeExpired ? 'bg-marigold-200' : 'bg-white/20'}`}
                    />
                  ))}
                </div>
              )}
            </div>
            <h2 className="font-display mt-3 text-2xl font-semibold">
              {TIER_LABELS[tier] ?? 'Not yet verified'}
              {badgeExpired && ' — due for renewal'}
            </h2>
            <p
              className={`mt-2 max-w-2xl leading-relaxed ${badgeExpired ? 'text-pine-950/80' : 'text-pine-100/85'}`}
            >
              {TIER_RESIDENT_FACING[tier] ?? TIER_RESIDENT_FACING.none}
            </p>
            {badgeExpired ? (
              <p className="text-marigold-700 mt-3 text-sm">
                This check has lapsed, so treat it as out of date. We will re-confirm
                the details with the operator before any booking.
              </p>
            ) : (
              listing.verificationExpiresAt && (
                <p className="text-pine-200/80 mt-3 text-sm">
                  Checked {isoDate(listing.verifiedAt) ?? 'recently'} · valid until{' '}
                  {isoDate(listing.verificationExpiresAt)}
                </p>
              )
            )}
          </section>

          {listing.description && (
            <Section title="About this stay">
              <p className="text-ink/85 text-lg leading-relaxed whitespace-pre-line">
                {listing.description}
              </p>
            </Section>
          )}

          <Section title="Rooms and pricing">
            <div className="grid gap-4 sm:grid-cols-2">
              {listing.rooms.map((room) => (
                <div key={room.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-ink font-semibold">{room.name}</h3>
                      <p className="text-ink-soft mt-0.5 text-sm">
                        {room.occupancy === 1
                          ? 'Private room'
                          : `${room.occupancy} sharing`}
                        {room.hasPrivateBathroom && ' · attached bathroom'}
                        {room.areaSqft ? ` · ${room.areaSqft} sq ft` : ''}
                      </p>
                    </div>
                    {(room.bedsFree ?? 0) > 0 ? (
                      <span className="bg-pine-50 text-pine-700 rounded-full px-2.5 py-1 text-xs font-semibold">
                        {room.bedsFree} free
                      </span>
                    ) : (
                      <span className="bg-sand text-ink-soft rounded-full px-2.5 py-1 text-xs font-medium">
                        On request
                      </span>
                    )}
                  </div>
                  <p className="text-ink mt-5 text-2xl font-bold tracking-tight">
                    {format(money(room.rentAmountMinor, 'INR'))}
                    <span className="text-ink-soft text-sm font-normal"> / month</span>
                  </p>
                  <dl className="border-line mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                    <div>
                      <dt className="text-ink-soft text-xs">Deposit</dt>
                      <dd className="text-ink font-medium">
                        {room.depositAmountMinor !== null
                          ? format(money(room.depositAmountMinor, 'INR'))
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-soft text-xs">Minimum stay</dt>
                      <dd className="text-ink font-medium">
                        {room.minTenureMonths}{' '}
                        {room.minTenureMonths === 1 ? 'month' : 'months'}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <p className="text-ink-soft mt-3 text-sm">
              Rent and deposit are as reported by the operator and paid to them
              directly. Availability is re-checked before a booking — we never promise a
              bed we have not confirmed.
            </p>
          </Section>

          {(safety.length > 0 || comfort.length > 0) && (
            <Section title="Safety and amenities">
              <div className="grid gap-6 sm:grid-cols-2">
                {safety.length > 0 && (
                  <FeatureList
                    heading="Safety"
                    items={safety.map((a) => a.label)}
                    strong
                  />
                )}
                {comfort.length > 0 && (
                  <FeatureList heading="Comfort" items={comfort.map((a) => a.label)} />
                )}
              </div>
            </Section>
          )}

          {campuses.length > 0 && (
            <Section title="Nearby campuses">
              <ul className="grid gap-3 sm:grid-cols-2">
                {campuses.map((campus) => (
                  <li key={campus.slug}>
                    <Link
                      href={`/near/${campus.slug}`}
                      className="card hover:border-pine-200 flex items-center justify-between gap-3 p-4 transition"
                    >
                      <span className="text-ink font-medium">{campus.name}</span>
                      <span className="bg-sand text-pine-800 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
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
                  <li key={rule.slug} className="chip hover:border-line hover:bg-white">
                    {rule.label}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Reviews from residents">
            {reviewSummary.count === 0 ? (
              <div className="card text-ink-soft p-6">
                No reviews yet. Only residents who booked through HashtagStay and moved
                in can review, so there are no anonymous ones.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="font-display text-pine-900 text-5xl font-semibold">
                      {reviewSummary.average?.toFixed(1)}
                    </p>
                    <p className="text-ink-soft text-sm">
                      overall, from {reviewSummary.count} verified{' '}
                      {reviewSummary.count === 1 ? 'stay' : 'stays'}
                    </p>
                  </div>
                  {reviewSummary.safetyAverage !== null && (
                    <div>
                      <p className="font-display text-pine-900 text-5xl font-semibold">
                        {reviewSummary.safetyAverage.toFixed(1)}
                      </p>
                      <p className="text-ink-soft text-sm">for safety</p>
                    </div>
                  )}
                </div>
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                  {reviewSummary.reviews.slice(0, 10).map((review) => (
                    <li key={review.id} className="card p-5">
                      <p
                        className="text-marigold-500"
                        aria-label={`${review.rating} out of 5`}
                      >
                        {'★'.repeat(review.rating)}
                        <span className="text-line">
                          {'★'.repeat(5 - review.rating)}
                        </span>
                      </p>
                      {review.title && (
                        <p className="text-ink mt-2 font-semibold">{review.title}</p>
                      )}
                      <p className="text-ink/85 mt-1 leading-relaxed">{review.body}</p>
                      <p className="text-ink-soft mt-3 text-xs">
                        {review.residentName} · verified stay ·{' '}
                        {review.createdAt.toISOString().slice(0, 7)}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        </div>

        {/* Booking panel */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            {cheapest && (
              <>
                <p className="text-ink-soft text-sm">
                  {listing.rooms.length > 1 ? 'Rooms from' : 'Rent'}
                </p>
                <p className="text-ink text-3xl font-bold tracking-tight">
                  {format(money(cheapest.rentAmountMinor, 'INR'))}
                  <span className="text-ink-soft text-base font-normal"> / month</span>
                </p>
              </>
            )}
            <p className="mt-2 text-sm">
              {bedsFree > 0 ? (
                <span className="text-pine-700 font-medium">
                  {bedsFree} {bedsFree === 1 ? 'bed' : 'beds'} reported free
                </span>
              ) : (
                <span className="text-ink-soft">Availability confirmed on request</span>
              )}
            </p>

            <Link
              href={`/enquiry?listing=${listing.slug}`}
              className="btn-primary mt-6 w-full py-3.5 text-base"
            >
              Check availability
            </Link>
            <div className="mt-3">
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

            <ul className="border-line text-ink mt-6 space-y-3 border-t pt-5 text-sm">
              {[
                ['Free to enquire', 'No brokerage, no charge to talk to us.'],
                [
                  'Operator confirms first',
                  'You pay nothing until your bed is confirmed.',
                ],
                [
                  'Private by default',
                  'Your number is never shared with the operator.',
                ],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span className="bg-pine-100 text-pine-700 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
                      <path
                        d="m5 12.5 4.5 4.5L19 7.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span>
                    <span className="font-semibold">{title}.</span>{' '}
                    <span className="text-ink-soft">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-pine-950 mb-5 text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FeatureList({
  heading,
  items,
  strong = false,
}: {
  heading: string;
  items: string[];
  strong?: boolean;
}) {
  return (
    <div className="card p-5">
      <p className="text-ink text-sm font-semibold">{heading}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-ink/85 flex items-center gap-2.5 text-sm">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${strong ? 'bg-pine-800 text-marigold-300' : 'bg-sand text-pine-700'}`}
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
                <path
                  d="m5 12.5 4.5 4.5L19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

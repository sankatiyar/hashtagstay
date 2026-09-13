import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Badge,
  VerificationBadge,
  genderPolicyLabel,
  propertyTypeLabel,
} from '@/components/ui/badge';
import { formatDistance } from '@/lib/geo';
import { format, money } from '@/lib/money';
import {
  absoluteUrl,
  breadcrumbJsonLd,
  jsonLdScript,
  listingJsonLd,
  pageTitle,
} from '@/lib/seo';
import {
  getPublicListing,
  listLiveListingSlugs,
  nearbyInstitutions,
} from '@/lib/services/public-search';
import { isExpired } from '@/lib/time';
import { toggleWishlistAction } from '@/app/(public)/account/actions';
import { ViewBeacon } from '@/components/public/view-beacon';
import { WishlistButton } from '@/components/public/wishlist-button';
import { listPhotos } from '@/lib/services/media';
import { publishedReviews } from '@/lib/services/reviews';
import { TIER_RESIDENT_FACING, type VerificationTier } from '@/lib/verification/rubric';
import { resolveAmenities, resolveHouseRules } from '@/lib/taxonomy/amenities';

/**
 * Public listing detail — the primary SEO landing page.
 *
 * Statically generated for known listings and revalidated, because this is the
 * page that has to rank and has to be fast. Rent and availability change, so
 * the window is short rather than indefinite.
 */
export const revalidate = 600;

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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
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
            {
              name: listing.city,
              path: `/city/${listing.city.toLowerCase().replaceAll(' ', '-')}`,
            },
            { name: listing.name, path: `/stays/${listing.slug}` },
          ]),
        )}
      />

      <ViewBeacon propertyId={listing.id} />
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <Link href="/search" className="hover:underline">
          Stays
        </Link>
        {' / '}
        <Link
          href={`/city/${listing.city.toLowerCase().replaceAll(' ', '-')}`}
          className="hover:underline"
        >
          {listing.city}
        </Link>
      </nav>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {listing.name}
          </h1>
          <p className="mt-1 text-slate-600">
            {listing.addressLine1}
            {listing.locality ? `, ${listing.locality}` : ''}, {listing.city}
            {listing.postalCode ? ` ${listing.postalCode}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="neutral">{propertyTypeLabel(listing.propertyType)}</Badge>
            <Badge tone="info">{genderPolicyLabel(listing.genderPolicy)}</Badge>
            <VerificationBadge tier={listing.verificationTier} expired={badgeExpired} />
          </div>
        </div>

        {cheapest && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-right">
            <p className="text-xs text-slate-500">
              {listing.rooms.length > 1 ? 'From' : 'Rent'}
            </p>
            <p className="text-2xl font-semibold text-slate-900">
              {format(money(cheapest.rentAmountMinor, 'INR'))}
            </p>
            <p className="text-xs text-slate-500">per month</p>
            <Link
              href={`/enquiry?listing=${listing.slug}`}
              className="mt-3 block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Check availability
            </Link>
            <div className="mt-2 flex justify-end">
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
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <section className="mt-6 grid gap-2 sm:grid-cols-3">
          {photos.slice(0, 6).map((photo, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- storage URLs vary by provider
            <img
              key={photo.id}
              src={photo.url}
              alt={photo.altText ?? `${listing.name} photo ${index + 1}`}
              className={`w-full rounded-lg object-cover ${index === 0 ? 'h-64 sm:col-span-3' : 'h-40'}`}
            />
          ))}
        </section>
      )}

      {/* The verification claim, stated in full rather than as a bare badge. */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">What we verified</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {TIER_RESIDENT_FACING[tier] ?? TIER_RESIDENT_FACING.none}
        </p>
        {badgeExpired && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This check has lapsed and is due for renewal, so treat it as out of date. We
            will re-confirm the details with the operator before any booking.
          </p>
        )}
      </section>

      {listing.description && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-slate-900">About this stay</h2>
          <p className="mt-2 leading-relaxed text-slate-700">{listing.description}</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Rooms and pricing</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Sharing</th>
                <th className="px-4 py-2.5 text-right">Rent / month</th>
                <th className="px-4 py-2.5 text-right">Deposit</th>
                <th className="px-4 py-2.5 text-right">Min stay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listing.rooms.map((room) => (
                <tr key={room.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {room.name}
                    {room.hasPrivateBathroom && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        attached bathroom
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {room.occupancy === 1 ? 'Private' : `${room.occupancy} sharing`}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {format(money(room.rentAmountMinor, 'INR'))}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {room.depositAmountMinor !== null
                      ? format(money(room.depositAmountMinor, 'INR'))
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {room.minTenureMonths}{' '}
                    {room.minTenureMonths === 1 ? 'month' : 'months'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Rent and deposit are as reported by the operator. Availability is confirmed
          with them before a booking is made — we never promise a bed we have not
          re-checked.
        </p>
      </section>

      {(safety.length > 0 || comfort.length > 0) && (
        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          {safety.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Safety</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {safety.map((amenity) => (
                  <li key={amenity.slug}>
                    <Badge tone="success">{amenity.label}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {comfort.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Amenities</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {comfort.map((amenity) => (
                  <li key={amenity.slug}>
                    <Badge tone="neutral">{amenity.label}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {campuses.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">Nearby campuses</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {campuses.map((campus) => (
              <li key={campus.slug}>
                <Link
                  href={`/near/${campus.slug}`}
                  className="text-slate-700 hover:underline"
                >
                  {campus.name}
                </Link>
                <span className="text-slate-500">
                  {' '}
                  — {formatDistance(campus.distanceMeters)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rules.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">House rules</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {rules.map((rule) => (
              <li key={rule.slug}>
                <Badge tone="muted">{rule.label}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Reviews from residents</h2>
        {reviewSummary.count === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No reviews yet. Only residents who booked through us and moved in can
            review, so there are no anonymous ones.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {reviewSummary.average?.toFixed(1)} / 5 from {reviewSummary.count}{' '}
              verified {reviewSummary.count === 1 ? 'stay' : 'stays'}
              {reviewSummary.safetyAverage !== null &&
                ` · safety ${reviewSummary.safetyAverage.toFixed(1)} / 5`}
            </p>
            <ul className="mt-3 space-y-3">
              {reviewSummary.reviews.slice(0, 10).map((review) => (
                <li
                  key={review.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
                >
                  <p className="font-medium text-slate-900">
                    {review.rating}/5{review.title ? ` — ${review.title}` : ''}
                  </p>
                  <p className="mt-1 text-slate-700">{review.body}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {review.residentName} · verified stay ·{' '}
                    {review.createdAt.toISOString().slice(0, 7)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Interested in this stay?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Tell us your dates and budget and a relationship manager will confirm current
          availability with the operator, answer your questions, and arrange a visit or
          video tour. There is no charge to enquire.
        </p>
        <Link
          href={`/enquiry?listing=${listing.slug}`}
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Check availability
        </Link>
      </section>
    </main>
  );
}

import Link from 'next/link';

import { Badge, VerificationBadge, genderPolicyLabel, propertyTypeLabel } from '@/components/ui/badge';
import { formatDistance } from '@/lib/geo';
import { format, money } from '@/lib/money';
import type { SearchResultRow } from '@/lib/services/public-search';
import { resolveAmenities } from '@/lib/taxonomy/amenities';

/**
 * Listing card for search and landing pages.
 *
 * What it shows is a deliberate set: what the place is, who it accepts, what it
 * costs, how far the campus is, and what we actually verified. What it never
 * shows is any way to contact the operator directly — that is the whole
 * commercial model, and it starts here.
 */
export function ListingCard({
  listing,
  showDistance = true,
}: {
  listing: SearchResultRow;
  showDistance?: boolean;
}) {
  // Safety amenities lead: for a resident booking sight-unseen in a new city,
  // these are what the decision actually turns on.
  const amenities = resolveAmenities(listing.amenities);
  const safety = amenities.filter((a) => a.isSafetySignal).slice(0, 3);
  const others = amenities.filter((a) => !a.isSafetySignal).slice(0, 3);

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">
            <Link href={`/stays/${listing.slug}`} className="hover:underline">
              {listing.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {listing.locality ? `${listing.locality}, ` : ''}
            {listing.city}
            {showDistance && listing.distanceMeters !== null && (
              <> · {formatDistance(listing.distanceMeters)} away</>
            )}
          </p>
        </div>
        <VerificationBadge tier={listing.verificationTier} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="neutral">{propertyTypeLabel(listing.propertyType)}</Badge>
        <Badge tone="info">{genderPolicyLabel(listing.genderPolicy)}</Badge>
        {listing.bedsFree > 0 ? (
          <Badge tone="success">
            {listing.bedsFree} {listing.bedsFree === 1 ? 'bed' : 'beds'} reported free
          </Badge>
        ) : (
          <Badge tone="muted" title="No beds currently reported free. We will confirm with the operator.">
            Availability on request
          </Badge>
        )}
      </div>

      {(safety.length > 0 || others.length > 0) && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {safety.map((amenity) => (
            <li key={amenity.slug}>
              <Badge tone="success">{amenity.label}</Badge>
            </li>
          ))}
          {others.map((amenity) => (
            <li key={amenity.slug}>
              <Badge tone="muted">{amenity.label}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
        <div>
          <p className="text-xs text-slate-500">
            {listing.roomTypeCount > 1 ? 'From' : 'Rent'}
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {format(money(listing.fromRentMinor, 'INR'))}
            <span className="text-sm font-normal text-slate-500"> / month</span>
          </p>
        </div>
        <Link
          href={`/stays/${listing.slug}`}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          View details
        </Link>
      </div>
    </article>
  );
}

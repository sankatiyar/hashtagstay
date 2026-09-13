import Link from 'next/link';

import { genderPolicyLabel, propertyTypeLabel } from '@/components/ui/badge';
import { formatDistance } from '@/lib/geo';
import { format, money } from '@/lib/money';
import type { SearchResultRow } from '@/lib/services/public-search';
import { TIER_LABELS, type VerificationTier } from '@/lib/verification/rubric';

import { Icon } from './icons';
import { ListingCover } from './listing-cover';

/**
 * Listing card for search and landing pages: photo first, then place, what it
 * is, and price — and never any way to contact the operator directly, which is
 * the whole commercial model.
 */
export function ListingCard({
  listing,
  showDistance = true,
}: {
  listing: SearchResultRow;
  showDistance?: boolean;
}) {
  const place = [listing.locality, listing.city].filter(Boolean).join(', ');
  const tier = listing.verificationTier as VerificationTier;

  return (
    <article className="group relative">
      <div className="relative aspect-[20/19] overflow-hidden rounded-2xl bg-sand">
        <div className="h-full w-full transition duration-500 group-hover:scale-[1.03]">
          <ListingCover
            seed={listing.slug}
            photoUrl={listing.coverUrl}
            alt={`${listing.name}, ${place}`}
          />
        </div>
        {tier !== 'none' && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-(--shadow-float)">
            <Icon name="shield" className="h-3.5 w-3.5 text-brand-600" strokeWidth={2.4} />
            {TIER_LABELS[tier] ?? tier}
          </span>
        )}
        <span className="absolute top-3 right-3 text-white drop-shadow-[0_1px_3px_rgb(0_0_0/0.45)]">
          <Icon name="heart" className="h-6 w-6" strokeWidth={2} />
        </span>
        {listing.bedsFree > 0 && (
          <span className="absolute bottom-3 left-3 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">
            {listing.bedsFree} {listing.bedsFree === 1 ? 'bed' : 'beds'} free
          </span>
        )}
      </div>

      <div className="mt-3 text-[15px]">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold text-ink">
            <Link
              href={`/stays/${listing.slug}`}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {place}
            </Link>
          </h3>
          {showDistance && listing.distanceMeters !== null && (
            <span className="shrink-0 text-sm text-ink">
              {formatDistance(listing.distanceMeters)}
            </span>
          )}
        </div>
        <p className="truncate text-ink-soft">{listing.name}</p>
        <p className="truncate text-ink-soft">
          {propertyTypeLabel(listing.propertyType)} · {genderPolicyLabel(listing.genderPolicy)}
        </p>
        <p className="mt-1.5 text-ink">
          {listing.roomTypeCount > 1 && <span className="text-ink-soft">From </span>}
          <span className="font-semibold">{format(money(listing.fromRentMinor, 'INR'))}</span>{' '}
          month
        </p>
      </div>
    </article>
  );
}

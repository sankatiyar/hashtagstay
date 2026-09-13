import Link from 'next/link';

import { genderPolicyLabel, propertyTypeLabel } from '@/components/ui/badge';
import { formatDistance } from '@/lib/geo';
import { format, money } from '@/lib/money';
import type { SearchResultRow } from '@/lib/services/public-search';
import { resolveAmenities } from '@/lib/taxonomy/amenities';
import { TIER_LABELS, type VerificationTier } from '@/lib/verification/rubric';

import { ListingCover } from './listing-cover';

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
  listing: SearchResultRow & { coverUrl?: string | null };
  showDistance?: boolean;
}) {
  // Safety amenities lead: for a resident booking sight-unseen in a new city,
  // these are what the decision actually turns on.
  const safety = resolveAmenities(listing.amenities)
    .filter((a) => a.isSafetySignal)
    .slice(0, 3);
  const place = [listing.locality, listing.city].filter(Boolean).join(', ');
  const tier = listing.verificationTier as VerificationTier;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-(--shadow-card) transition duration-300 hover:-translate-y-1 hover:shadow-(--shadow-lift)">
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        <div className="h-full w-full transition duration-700 group-hover:scale-[1.04]">
          <ListingCover
            seed={listing.slug}
            photoUrl={listing.coverUrl}
            alt={`${listing.name}, ${place}`}
          />
        </div>
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {tier !== 'none' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-pine-800 shadow-sm backdrop-blur">
              <span
                className={`h-1.5 w-1.5 rounded-full ${tier === 'onground_audited' ? 'bg-marigold-400' : 'bg-pine-500'}`}
              />
              {TIER_LABELS[tier] ?? tier}
            </span>
          )}
          {listing.bedsFree > 0 && (
            <span className="ml-auto rounded-full bg-pine-900/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              {listing.bedsFree} {listing.bedsFree === 1 ? 'bed' : 'beds'} free
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
          {propertyTypeLabel(listing.propertyType)} ·{' '}
          {genderPolicyLabel(listing.genderPolicy)}
        </p>
        <h3 className="mt-1.5 font-display text-xl leading-snug font-semibold tracking-tight text-ink">
          <Link
            href={`/stays/${listing.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {listing.name}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
            <path
              d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="12" cy="9.5" r="2.5" fill="currentColor" />
          </svg>
          <span className="truncate">
            {place}
            {showDistance && listing.distanceMeters !== null && (
              <> · {formatDistance(listing.distanceMeters)} away</>
            )}
          </span>
        </p>

        {safety.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {safety.map((amenity) => (
              <li
                key={amenity.slug}
                className="inline-flex items-center gap-1 rounded-full bg-pine-50 px-2.5 py-1 text-xs font-medium text-pine-700"
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
                {amenity.label}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between border-t border-line pt-4">
            <div>
              <p className="text-xs text-ink-soft">
                {listing.roomTypeCount > 1 ? 'From' : 'Rent'}
              </p>
              <p className="text-xl font-bold tracking-tight text-ink">
                {format(money(listing.fromRentMinor, 'INR'))}
                <span className="text-sm font-normal text-ink-soft"> / month</span>
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sand text-pine-800 transition duration-300 group-hover:bg-pine-800 group-hover:text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Badge,
  FreshnessBadge,
  ListingStateBadge,
  VerificationBadge,
  genderPolicyLabel,
  propertyTypeLabel,
} from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { format, money } from '@/lib/money';
import { getPropertyDetail } from '@/lib/services/properties';
import { allowedFrom, listingMachine } from '@/lib/state-machines';
import { resolveAmenities, resolveHouseRules } from '@/lib/taxonomy/amenities';

import { AvailabilityForm } from './availability-form';
import { TransitionForm } from './transition-form';

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PropertyDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await requirePermission('property:view', {
    returnTo: `/admin/properties/${id}`,
  });

  const detail = await getPropertyDetail(id);
  if (!detail) notFound();

  const { property, organizationName, rooms } = detail;

  // Offer only transitions the machine actually allows from here, so the UI
  // cannot present a move that the write path will reject.
  const nextStates = allowedFrom(listingMachine, property.listingState);

  const amenities = resolveAmenities(property.amenities);
  const houseRules = resolveHouseRules(property.houseRules);

  const canPublish = can(user.roles, 'property:publish');
  const canEditAvailability = can(user.roles, 'availability:edit');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/properties"
          className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
        >
          ← Inventory
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {property.name}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {property.addressLine1}
              {property.locality ? `, ${property.locality}` : ''}, {property.city} ·{' '}
              {organizationName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ListingStateBadge state={property.listingState} />
            <VerificationBadge
              tier={property.verificationTier}
              expired={detail.verificationExpired}
            />
            <Badge tone="neutral">{propertyTypeLabel(property.propertyType)}</Badge>
            <Badge tone="info">{genderPolicyLabel(property.genderPolicy)}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white">
            <header className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Rooms and availability
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Availability is advisory. Confirm with the operator before a bed is
                promised to a resident.
              </p>
            </header>

            {rooms.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">
                No room types yet. A property cannot be listed without at least one.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rooms.map(
                  ({
                    roomType,
                    availableCount,
                    availabilitySource,
                    availabilityAgeDays,
                    availabilityConfirmedOn,
                    availabilityNotes,
                  }) => (
                    <li key={roomType.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">
                            {roomType.name}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {roomType.occupancy}-person
                              {roomType.hasPrivateBathroom
                                ? ' · attached bathroom'
                                : ''}
                            </span>
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {format(money(roomType.rentAmountMinor, 'INR'))}
                            <span className="text-slate-400"> / month</span>
                            {roomType.depositAmountMinor !== null && (
                              <>
                                {' · deposit '}
                                {format(money(roomType.depositAmountMinor, 'INR'))}
                              </>
                            )}
                            {' · min '}
                            {roomType.minTenureMonths}
                            {roomType.minTenureMonths === 1 ? ' month' : ' months'}
                          </p>
                          {availabilityNotes && (
                            <p className="mt-1 text-xs text-slate-500 italic">
                              {availabilityNotes}
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-900 tabular-nums">
                            {availableCount ?? 0} free
                          </p>
                          <div className="mt-1 flex flex-col items-end gap-1">
                            <FreshnessBadge
                              ageDays={availabilityAgeDays}
                              confirmedOn={availabilityConfirmedOn}
                            />
                            {availabilitySource && (
                              <Badge
                                tone={
                                  availabilitySource === 'import' ? 'warning' : 'muted'
                                }
                                title={
                                  availabilitySource === 'import'
                                    ? 'Bulk import — the least trustworthy provenance. Confirm with the operator.'
                                    : `Last asserted by: ${availabilitySource}`
                                }
                              >
                                via {availabilitySource}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {canEditAvailability && (
                        <AvailabilityForm
                          propertyId={property.id}
                          roomTypeId={roomType.id}
                          currentCount={availableCount ?? 0}
                        />
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Amenities</h2>
            {amenities.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None recorded.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {amenities.map((amenity) => (
                  <li key={amenity.slug}>
                    <Badge tone={amenity.isSafetySignal ? 'success' : 'neutral'}>
                      {amenity.label}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mt-5 text-sm font-semibold text-slate-900">House rules</h2>
            {houseRules.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None recorded.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {houseRules.map((rule) => (
                  <li key={rule.slug}>
                    <Badge tone="muted">{rule.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Verification</h2>
            <p className="mt-1 text-xs text-slate-500">
              The checklist decides the tier, and every grant expires. Whoever entered
              this property cannot be the one to certify it.
            </p>
            <Link
              href={`/admin/properties/${property.id}/verify`}
              className="mt-3 inline-block rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Open verification review
            </Link>
            <Link
              href={`/admin/properties/${property.id}/media`}
              className="mt-3 ml-2 inline-block rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Photos and documents
            </Link>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Lifecycle</h2>
            <p className="mt-1 text-xs text-slate-500">
              Currently <strong>{property.listingState.replaceAll('_', ' ')}</strong>.
              Only transitions the listing machine permits are offered.
            </p>

            {nextStates.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                This is a terminal state — nothing further is possible.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {nextStates.map((state) => (
                  <TransitionForm
                    key={state}
                    propertyId={property.id}
                    to={state}
                    disabled={state === 'live' && !canPublish}
                    disabledReason={
                      state === 'live' && !canPublish
                        ? 'Publishing requires the verifier role — approval is what takes a listing live.'
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Details</h2>
            <dl className="mt-3 space-y-2 text-slate-600">
              <Row label="Slug" value={property.slug} />
              <Row
                label="Coordinates"
                value={
                  property.location
                    ? `${property.location.y.toFixed(5)}, ${property.location.x.toFixed(5)}`
                    : 'Not set — excluded from proximity search'
                }
              />
              <Row
                label="Published"
                value={
                  property.publishedAt
                    ? property.publishedAt.toISOString().slice(0, 10)
                    : 'Never'
                }
              />
              <Row
                label="Last reviewed"
                value={
                  property.lastReviewedAt
                    ? property.lastReviewedAt.toISOString().slice(0, 10)
                    : 'Never'
                }
              />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  );
}

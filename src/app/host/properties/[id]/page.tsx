import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MediaManager } from '@/components/shared/media-manager';
import { ActionForm } from '@/components/ui/action-form';
import {
  FreshnessBadge,
  ListingStateBadge,
  VerificationBadge,
} from '@/components/ui/badge';
import { requireHost } from '@/lib/auth/host';
import { storageReady } from '@/lib/integrations/storage';
import { format, money } from '@/lib/money';
import { getPropertyDetail } from '@/lib/services/properties';
import { getActiveVerification } from '@/lib/services/verification';
import { ageInDaysOrNull, isoDate } from '@/lib/time';
import { TIER_LABELS, TIER_RESIDENT_FACING } from '@/lib/verification/rubric';

import {
  hostAvailabilityAction,
  hostPhotoCommand,
  hostRequestVerification,
  hostUploadDocument,
  hostUploadPhotos,
} from '../../actions';

const input = 'rounded-md border border-slate-300 px-2.5 py-1.5 text-sm';

export default async function HostPropertyPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await props.params;
  const { created } = await props.searchParams;
  const ctx = await requireHost(`/host/properties/${id}`);
  const detail = await getPropertyDetail(id);
  if (!detail || detail.organizationId !== ctx.organizationId) notFound();

  const { property, rooms } = detail;
  const active = await getActiveVerification(id);
  const canRequest =
    !active &&
    ['draft', 'changes_requested', 'submitted'].includes(property.listingState);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/host/properties" className="text-sm text-slate-500 hover:underline">
        ← Properties
      </Link>
      {created && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Draft created. Add photos and documents below, then send it for verification.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {property.name}
          </h1>
          <p className="text-sm text-slate-500">
            {property.addressLine1}
            {property.locality ? `, ${property.locality}` : ''}, {property.city}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ListingStateBadge state={property.listingState} />
          <VerificationBadge tier={property.verificationTier} />
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Availability</h2>
        <p className="mt-1 text-xs text-slate-500">
          Confirm free beds whenever they change, and at least weekly. Stale
          availability is the main reason residents are sent elsewhere.
        </p>
        <ul className="mt-3 divide-y divide-slate-100">
          {rooms.map(({ roomType, availableCount, lastConfirmedAt }) => (
            <li key={roomType.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-900">
                  {roomType.name} · {format(money(roomType.rentAmountMinor, 'INR'))}
                  /month
                </span>
                <FreshnessBadge ageDays={ageInDaysOrNull(lastConfirmedAt)} />
              </div>
              <ActionForm
                action={hostAvailabilityAction}
                submitLabel="Confirm"
                tone="secondary"
                inline
              >
                <input type="hidden" name="propertyId" value={id} />
                <input type="hidden" name="roomTypeId" value={roomType.id} />
                <label className="text-xs text-slate-600">
                  Beds free{' '}
                  <input
                    name="availableCount"
                    type="number"
                    min={0}
                    defaultValue={availableCount ?? 0}
                    className={`${input} w-20`}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  From <input name="availableFrom" type="date" className={input} />
                </label>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <MediaManager
        propertyId={id}
        uploadPhotos={hostUploadPhotos}
        photoCommand={hostPhotoCommand}
        uploadDocumentAction={hostUploadDocument}
        storageReady={storageReady()}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-slate-900">Verification</h2>
        {active ? (
          <p className="mt-2 text-slate-600">
            In review since {isoDate(active.createdAt)} for “
            {TIER_LABELS[active.requestedTier]}”. We will be in touch if anything is
            missing.
          </p>
        ) : property.listingState === 'live' ? (
          <p className="mt-2 text-slate-600">
            Live. {TIER_RESIDENT_FACING[property.verificationTier]} Expires{' '}
            {isoDate(property.verificationExpiresAt) ?? '—'}.
          </p>
        ) : canRequest ? (
          <ActionForm
            action={hostRequestVerification}
            submitLabel="Send for verification"
            className="mt-3 space-y-2"
          >
            <input type="hidden" name="propertyId" value={id} />
            <select name="tier" className={input}>
              <option value="documents_checked">
                Documents checked (ownership/lease, ID)
              </option>
              <option value="photos_verified">Photos verified</option>
              <option value="onground_audited">On-ground audit (we visit)</option>
            </select>
            <p className="text-xs text-slate-500">
              Upload ownership or lease proof and ID above first. Higher tiers rank
              better with residents.
            </p>
          </ActionForm>
        ) : (
          <p className="mt-2 text-slate-600">
            Current status: {property.listingState.replaceAll('_', ' ')}.
          </p>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActionForm } from '@/components/ui/action-form';
import {
  Badge,
  VerificationBadge,
  genderPolicyLabel,
  propertyTypeLabel,
} from '@/components/ui/badge';
import { fileUrl } from '@/lib/integrations/storage';
import { format, money } from '@/lib/money';
import { getPublicShortlist, recordShortlistView } from '@/lib/services/shortlists';
import { resolveAmenities } from '@/lib/taxonomy/amenities';
import { isoDate } from '@/lib/time';

import { markInterest } from './actions';

export const metadata: Metadata = {
  title: 'Your shortlist · HashtagStay',
  // Personal to one resident; never indexed.
  robots: { index: false, follow: false },
};

export default async function ShortlistPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const data = await getPublicShortlist(token);
  if (!data) notFound();

  if (data.expired) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-xl font-semibold text-slate-900">
          This shortlist has expired
        </h1>
        <p className="mt-2 text-slate-600">
          Prices and availability change, so shortlists are only held for a week. Ask{' '}
          {data.rmName?.split(' ')[0] ?? 'your relationship manager'} for an updated
          one.
        </p>
      </main>
    );
  }

  await recordShortlistView(token);
  const first = data.contactName?.split(' ')[0];
  const covers = await Promise.all(
    data.items.map((item) =>
      item.coverPath ? fileUrl('public', item.coverPath) : Promise.resolve(null),
    ),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {first ? `${first}, here are your stays` : 'Your shortlist'}
      </h1>
      <p className="mt-2 text-slate-600">
        Picked by {data.rmName?.split(' ')[0] ?? 'your relationship manager'} after
        checking availability with each operator. Prices are held as quoted until{' '}
        {isoDate(data.shortlist.expiresAt)}.
      </p>
      {data.shortlist.message && (
        <blockquote className="mt-4 rounded-lg border-l-4 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {data.shortlist.message}
        </blockquote>
      )}

      <ol className="mt-6 space-y-4">
        {data.items.map((item, index) => {
          const priceChanged =
            item.currentRentAmountMinor !== null &&
            item.quotedRentAmountMinor !== null &&
            item.currentRentAmountMinor !== item.quotedRentAmountMinor;
          const safety = resolveAmenities(item.amenities)
            .filter((a) => a.isSafetySignal)
            .slice(0, 3);
          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              {covers[index] && (
                // eslint-disable-next-line @next/next/no-img-element -- storage URLs vary by provider
                <img
                  src={covers[index]!}
                  alt={item.propertyName}
                  className="h-48 w-full object-cover"
                />
              )}
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">Option {index + 1}</p>
                    <h2 className="font-semibold text-slate-900">
                      {item.propertyName}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {item.locality ? `${item.locality}, ` : ''}
                      {item.city}
                      {item.roomName && ` · ${item.roomName}`}
                    </p>
                  </div>
                  <VerificationBadge tier={item.verificationTier} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="neutral">{propertyTypeLabel(item.propertyType)}</Badge>
                  <Badge tone="info">{genderPolicyLabel(item.genderPolicy)}</Badge>
                  {safety.map((a) => (
                    <Badge key={a.slug} tone="success">
                      {a.label}
                    </Badge>
                  ))}
                </div>

                {item.quotedRentAmountMinor !== null && (
                  <p className="mt-3 text-lg font-semibold text-slate-900">
                    {format(money(item.quotedRentAmountMinor, 'INR'))}
                    <span className="text-sm font-normal text-slate-500">
                      {' '}
                      / month quoted
                    </span>
                  </p>
                )}
                {item.quotedDepositAmountMinor !== null && (
                  <p className="text-sm text-slate-600">
                    Deposit {format(money(item.quotedDepositAmountMinor, 'INR'))}
                  </p>
                )}
                {priceChanged && (
                  <p className="mt-1 text-xs text-amber-800">
                    The operator’s listed price has changed since this was quoted. Your
                    relationship manager will confirm.
                  </p>
                )}
                {item.rmNote && (
                  <p className="mt-3 text-sm text-slate-700">“{item.rmNote}”</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {item.propertyState === 'live' && (
                    <Link
                      href={`/stays/${item.propertySlug}`}
                      className="text-sm text-slate-700 underline"
                    >
                      Full details
                    </Link>
                  )}
                  {item.residentInterest ? (
                    <Badge
                      tone={
                        item.residentInterest === 'interested' ? 'success' : 'muted'
                      }
                    >
                      {item.residentInterest === 'interested'
                        ? 'You are interested'
                        : 'Not for you'}
                    </Badge>
                  ) : (
                    <>
                      <ActionForm
                        action={markInterest}
                        submitLabel="I’m interested"
                        inline
                      >
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="interest" value="interested" />
                      </ActionForm>
                      <ActionForm
                        action={markInterest}
                        submitLabel="Not for me"
                        tone="secondary"
                        inline
                      >
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="interest" value="not_interested" />
                      </ActionForm>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-sm text-slate-600">
        Questions? Reply to the message that brought you here and your relationship
        manager will call you back. For everyone’s safety we never share operators’
        personal numbers.
      </p>
    </main>
  );
}

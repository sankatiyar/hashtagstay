import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ListingCover } from '@/components/public/listing-cover';
import { ActionForm } from '@/components/ui/action-form';
import { Badge, genderPolicyLabel, propertyTypeLabel } from '@/components/ui/badge';
import { fileUrl } from '@/lib/integrations/storage';
import { format, money } from '@/lib/money';
import { getPublicShortlist, recordShortlistView } from '@/lib/services/shortlists';
import { resolveAmenities } from '@/lib/taxonomy/amenities';
import { isoDate } from '@/lib/time';
import { TIER_LABELS, type VerificationTier } from '@/lib/verification/rubric';

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

  const rmFirst = data.rmName?.split(' ')[0] ?? 'your relationship manager';

  if (data.expired) {
    return (
      <main className="container-page max-w-xl py-16">
        <div className="card p-8">
          <h1 className="font-display text-pine-950 text-3xl font-semibold">
            This shortlist has expired
          </h1>
          <p className="text-ink-soft mt-3">
            Prices and availability change, so shortlists are only held for a week. Ask{' '}
            {rmFirst} for an updated one.
          </p>
          <Link href="/search" className="btn-secondary mt-6">
            Browse stays meanwhile
          </Link>
        </div>
      </main>
    );
  }

  await recordShortlistView(token);
  const first = data.contactName?.split(' ')[0];
  const covers = await Promise.all(
    data.items.map((item) =>
      item.coverPath
        ? fileUrl('public', item.coverPath).catch(() => null)
        : Promise.resolve(null),
    ),
  );

  return (
    <main className="container-page max-w-5xl py-12">
      <p className="eyebrow">Your shortlist</p>
      <h1 className="font-display text-pine-950 mt-2 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
        {first ? `${first}, here are your stays` : 'Here are your stays'}
      </h1>
      <p className="text-ink-soft mt-3 max-w-2xl text-lg">
        Picked by <strong className="text-ink">{rmFirst}</strong> after checking
        availability with each operator. Prices are held as quoted until{' '}
        {isoDate(data.shortlist.expiresAt)}.
      </p>
      {data.shortlist.message && (
        <blockquote className="bg-pine-800 mt-6 max-w-2xl rounded-3xl rounded-tl-md px-6 py-5 text-white">
          <p className="leading-relaxed">“{data.shortlist.message}”</p>
          <p className="text-pine-200 mt-2 text-sm">— {rmFirst}</p>
        </blockquote>
      )}

      <ol className="mt-10 space-y-6">
        {data.items.map((item, index) => {
          const priceChanged =
            item.currentRentAmountMinor !== null &&
            item.quotedRentAmountMinor !== null &&
            item.currentRentAmountMinor !== item.quotedRentAmountMinor;
          const safety = resolveAmenities(item.amenities)
            .filter((a) => a.isSafetySignal)
            .slice(0, 3);
          const tier = item.verificationTier as VerificationTier;
          return (
            <li
              key={item.id}
              className="card grid overflow-hidden md:grid-cols-[320px_1fr]"
            >
              <div className="relative h-56 md:h-full">
                <ListingCover
                  seed={item.propertySlug}
                  photoUrl={covers[index]}
                  alt={item.propertyName}
                />
                <span className="text-pine-900 absolute top-4 left-4 rounded-full bg-white px-3 py-1 text-xs font-bold shadow">
                  Option {index + 1}
                </span>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-ink text-2xl font-semibold">
                      {item.propertyName}
                    </h2>
                    <p className="text-ink-soft mt-0.5">
                      {item.locality ? `${item.locality}, ` : ''}
                      {item.city}
                      {item.roomName && ` · ${item.roomName}`}
                    </p>
                  </div>
                  {tier !== 'none' && (
                    <Badge tone="success">{TIER_LABELS[tier] ?? tier}</Badge>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="neutral">{propertyTypeLabel(item.propertyType)}</Badge>
                  <Badge tone="neutral">{genderPolicyLabel(item.genderPolicy)}</Badge>
                  {safety.map((a) => (
                    <Badge key={a.slug} tone="success">
                      {a.label}
                    </Badge>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-1">
                  {item.quotedRentAmountMinor !== null && (
                    <p className="text-ink text-2xl font-bold tracking-tight">
                      {format(money(item.quotedRentAmountMinor, 'INR'))}
                      <span className="text-ink-soft text-sm font-normal">
                        {' '}
                        / month quoted
                      </span>
                    </p>
                  )}
                  {item.quotedDepositAmountMinor !== null && (
                    <p className="text-ink-soft text-sm">
                      Deposit {format(money(item.quotedDepositAmountMinor, 'INR'))}
                    </p>
                  )}
                </div>
                {priceChanged && (
                  <p className="text-marigold-700 mt-2 text-xs">
                    The operator’s listed price has changed since this was quoted. Your
                    relationship manager will confirm.
                  </p>
                )}
                {item.rmNote && (
                  <p className="bg-sand text-ink mt-4 rounded-2xl px-4 py-3 text-sm">
                    <span className="font-semibold">{rmFirst}:</span> “{item.rmNote}”
                  </p>
                )}

                <div className="border-line mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
                  {item.residentInterest ? (
                    <Badge
                      tone={
                        item.residentInterest === 'interested' ? 'success' : 'muted'
                      }
                    >
                      {item.residentInterest === 'interested'
                        ? 'You’re interested — we’ll be in touch'
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
                  {item.propertyState === 'live' && (
                    <Link
                      href={`/stays/${item.propertySlug}`}
                      className="text-pine-700 ml-auto text-sm font-semibold hover:underline"
                    >
                      Full details →
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-ink-soft mt-10 max-w-2xl text-sm">
        Questions? Reply to the message that brought you here and {rmFirst} will call
        you back. For everyone’s safety we never share operators’ personal numbers.
      </p>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { absoluteUrl, pageTitle } from '@/lib/seo';
import { CONSENT_NOTICES } from '@/lib/services/consent';
import {
  findInstitution,
  getPublicListing,
  listLiveCities,
} from '@/lib/services/public-search';

import { EnquiryForm } from './enquiry-form';

/**
 * Enquiry (FR-06): the start of PRD Journey A. Two steps — details, then a phone
 * code — and the lead reaches the relationship-manager desk the moment the code
 * is verified.
 */

export const metadata: Metadata = {
  title: pageTitle('Tell us what you need'),
  description:
    'Share your city, budget and move-in date and a HashtagStay relationship manager will confirm availability with operators for you. Free to enquire.',
  alternates: { canonical: absoluteUrl('/enquiry') },
};

const STEPS = [
  [
    'Verify your number',
    'A one-time code confirms it’s really you. Takes ten seconds.',
  ],
  [
    'We check with operators',
    'Your relationship manager confirms beds and prices directly.',
  ],
  [
    'You get a call and a shortlist',
    'Two or three genuine options, sent to your phone.',
  ],
  [
    'Book only when it’s confirmed',
    'The operator confirms your bed before you pay anything.',
  ],
] as const;

export default async function EnquiryPage(props: {
  searchParams: Promise<{ listing?: string; near?: string; city?: string }>;
}) {
  const params = await props.searchParams;

  const [listing, campus, cities] = await Promise.all([
    params.listing ? getPublicListing(params.listing) : Promise.resolve(null),
    params.near ? findInstitution(params.near) : Promise.resolve(null),
    listLiveCities(),
  ]);

  return (
    <main className="container-page py-12">
      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <p className="eyebrow">Free, no obligation</p>
          <h1 className="font-display text-pine-950 mt-3 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Tell us what you need
          </h1>
          <p className="text-ink-soft mt-4 max-w-2xl text-lg leading-relaxed">
            A relationship manager checks availability and pricing with operators
            directly, then calls you with genuine options. Your number is never shared
            with an operator.
          </p>

          {(listing || campus) && (
            <div className="border-pine-200 bg-pine-50 text-pine-900 mt-6 inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm">
              <span className="bg-pine-800 text-marigold-300 flex h-8 w-8 items-center justify-center rounded-xl">
                ✓
              </span>
              {listing ? (
                <span>
                  Enquiring about{' '}
                  <Link
                    href={`/stays/${listing.slug}`}
                    className="font-semibold underline"
                  >
                    {listing.name}
                  </Link>
                  , {listing.city}
                </span>
              ) : (
                <span>
                  Looking near <strong>{campus!.name}</strong>, {campus!.city}
                </span>
              )}
            </div>
          )}

          <div className="mt-8">
            <EnquiryForm
              listing={listing?.slug ?? null}
              near={campus?.slug ?? null}
              city={listing?.city ?? campus?.city ?? params.city ?? null}
              cities={cities.map((c) => c.city)}
              contactNotice={CONSENT_NOTICES.lead_contact}
              recordingNotice={CONSENT_NOTICES.call_recording}
            />
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-pine-900 rounded-3xl p-7 text-white">
            <p className="text-marigold-300 text-xs font-semibold tracking-[0.14em] uppercase">
              What happens next
            </p>
            <ol className="mt-6 space-y-6">
              {STEPS.map(([title, body], index) => (
                <li key={title} className="relative flex gap-4">
                  {index < STEPS.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-9 left-[15px] h-[calc(100%-12px)] w-px bg-white/15"
                    />
                  )}
                  <span className="text-marigold-300 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold ring-1 ring-white/20">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-pine-100/75 mt-1 text-sm leading-relaxed">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-ink-soft mt-4 px-2 text-sm">
            Already enquired?{' '}
            <Link
              href="/account"
              className="text-pine-700 font-semibold hover:underline"
            >
              Track it in your account
            </Link>
          </p>
        </aside>
      </div>
    </main>
  );
}

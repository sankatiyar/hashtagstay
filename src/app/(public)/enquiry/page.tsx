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
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Tell us what you need
      </h1>
      <p className="mt-2 text-slate-600">
        A relationship manager checks availability and pricing with the operators
        directly, then calls you with two or three genuine options. It is free, and your
        number is never shared with an operator.
      </p>

      {listing && (
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          About{' '}
          <Link href={`/stays/${listing.slug}`} className="font-medium underline">
            {listing.name}
          </Link>
          , {listing.city}
        </p>
      )}
      {campus && !listing && (
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Near {campus.name}, {campus.city}
        </p>
      )}

      <div className="mt-6">
        <EnquiryForm
          listing={listing?.slug ?? null}
          near={campus?.slug ?? null}
          city={listing?.city ?? campus?.city ?? params.city ?? null}
          cities={cities.map((c) => c.city)}
          contactNotice={CONSENT_NOTICES.lead_contact}
          recordingNotice={CONSENT_NOTICES.call_recording}
        />
      </div>
    </main>
  );
}

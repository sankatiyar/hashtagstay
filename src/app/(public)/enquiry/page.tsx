import type { Metadata } from 'next';
import Link from 'next/link';

import { absoluteUrl, pageTitle } from '@/lib/seo';
import { findInstitution, getPublicListing } from '@/lib/services/public-search';

/**
 * Enquiry entry point — placeholder.
 *
 * The real form is the next piece of M2, and it is not a small one: it has to
 * capture the attribution block at insert (utm/gclid/fbclid/referrer/landing
 * page — none of which can be reconstructed later), verify the phone by OTP to
 * keep bot traffic off the RM desk, record DPDP consent with a policy version,
 * and route under-18 enquirers through a guardian flow.
 *
 * Phone OTP is the blocker: Indian transactional SMS requires TRAI DLT
 * registration of the entity, sender ID and template before anything delivers.
 * Building the form without it would mean either shipping an unverified form
 * that floods the desk, or shipping a verified one that silently fails.
 *
 * This exists as a real route so that the "Check availability" calls to action
 * across the site do not 404, and it says plainly what is missing rather than
 * pretending to accept an enquiry it cannot follow up.
 */

export const metadata: Metadata = {
  title: pageTitle('Tell us what you need'),
  description:
    'Share your city, budget and move-in dates and a HashtagStay relationship manager will confirm availability with operators on your behalf.',
  alternates: { canonical: absoluteUrl('/enquiry') },
};

export default async function EnquiryPage(props: {
  searchParams: Promise<{ listing?: string; near?: string }>;
}) {
  const { listing: listingSlug, near } = await props.searchParams;

  const [listing, campus] = await Promise.all([
    listingSlug ? getPublicListing(listingSlug) : Promise.resolve(null),
    near ? findInstitution(near) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Tell us what you need
      </h1>

      {listing && (
        <p className="mt-2 text-slate-600">
          About{' '}
          <Link href={`/stays/${listing.slug}`} className="underline">
            {listing.name}
          </Link>
          , {listing.city}.
        </p>
      )}
      {campus && !listing && (
        <p className="mt-2 text-slate-600">
          Near {campus.name}, {campus.city}.
        </p>
      )}

      <div className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6">
        <h2 className="font-semibold text-amber-900">
          The enquiry form is not live yet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900">
          It needs phone verification before it can go live, and that depends on TRAI
          DLT registration for transactional SMS — an external approval we are waiting
          on. An enquiry form without it would fill the desk with bot submissions and
          slow down real residents.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900">
          Rather than accept an enquiry we cannot yet follow up properly, this page is
          honest about the gap.
        </p>
      </div>

      <div className="mt-8">
        <h2 className="font-semibold text-slate-900">In the meantime</h2>
        <p className="mt-2 leading-relaxed text-slate-600">
          Every listing shows its rent, deposit, room sharing, house rules and exactly
          which verification checks we completed — enough to shortlist properly before
          you speak to anyone.
        </p>
        <Link
          href="/search"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Browse verified stays
        </Link>
      </div>
    </main>
  );
}

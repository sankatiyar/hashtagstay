import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActionForm } from '@/components/ui/action-form';
import { getCurrentResident } from '@/lib/auth/resident';
import { reviewEligibility } from '@/lib/services/reviews';

import { submitReviewAction } from '../../actions';

export const metadata: Metadata = {
  title: 'Review your stay · HashtagStay',
  robots: { index: false, follow: false },
};

export default async function ReviewPage(props: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await props.params;
  const resident = await getCurrentResident();
  if (!resident) redirect(`/account/login?next=/account/reviews/${bookingId}`);

  const check = await reviewEligibility(bookingId, resident.id, resident.phone);

  return (
    <main className="container-page max-w-2xl py-10">
      <Link
        href="/account"
        className="text-ink-soft hover:text-ink text-sm font-medium"
      >
        ← Your account
      </Link>
      <h1 className="font-display text-pine-950 mt-3 text-4xl font-semibold tracking-tight">
        Review your stay
      </h1>
      {!check.eligible ? (
        <p className="card text-ink-soft mt-6 p-6">{check.reason}</p>
      ) : (
        <>
          <p className="text-ink-soft mt-3">
            Reviews are only accepted from residents who actually stayed, and are
            checked before they appear. Be honest — it’s the most useful thing the next
            resident can read.
          </p>
          <ActionForm
            action={submitReviewAction}
            submitLabel="Submit review"
            className="card mt-8 space-y-5 p-6"
          >
            <input type="hidden" name="bookingId" value={bookingId} />
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="rating" className="label">
                  Overall
                </label>
                <select id="rating" name="rating" defaultValue="5" className="field">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {'★'.repeat(n)} {n} / 5
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="safetyRating" className="label">
                  How safe did you feel?
                </label>
                <select
                  id="safetyRating"
                  name="safetyRating"
                  defaultValue=""
                  className="field"
                >
                  <option value="">Prefer not to say</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="title" className="label">
                Headline <span className="text-ink-soft font-normal">(optional)</span>
              </label>
              <input id="title" name="title" className="field" />
            </div>
            <div>
              <label htmlFor="body" className="label">
                Your review
              </label>
              <textarea
                id="body"
                name="body"
                rows={6}
                className="field"
                placeholder="What was it really like — rooms, food, staff, safety, the neighbourhood?"
              />
            </div>
          </ActionForm>
        </>
      )}
    </main>
  );
}

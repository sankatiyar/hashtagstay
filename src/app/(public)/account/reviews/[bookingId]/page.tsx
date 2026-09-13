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

const input =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900';

export default async function ReviewPage(props: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await props.params;
  const resident = await getCurrentResident();
  if (!resident) redirect(`/account/login?next=/account/reviews/${bookingId}`);

  const check = await reviewEligibility(bookingId, resident.id, resident.phone);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Link href="/account" className="text-sm text-slate-500 hover:underline">
        ← Your account
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Review your stay
      </h1>
      {!check.eligible ? (
        <p className="mt-4 text-slate-600">{check.reason}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Reviews are only accepted from residents who actually stayed, and are
            checked before they appear. Be honest — it is the most useful thing the next
            resident can read.
          </p>
          <ActionForm
            action={submitReviewAction}
            submitLabel="Submit review"
            className="mt-6 space-y-4"
          >
            <input type="hidden" name="bookingId" value={bookingId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rating"
                  className="block text-sm font-medium text-slate-700"
                >
                  Overall
                </label>
                <select id="rating" name="rating" defaultValue="5" className={input}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="safetyRating"
                  className="block text-sm font-medium text-slate-700"
                >
                  How safe did you feel?
                </label>
                <select
                  id="safetyRating"
                  name="safetyRating"
                  defaultValue=""
                  className={input}
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
              <label
                htmlFor="title"
                className="block text-sm font-medium text-slate-700"
              >
                Headline (optional)
              </label>
              <input id="title" name="title" className={input} />
            </div>
            <div>
              <label
                htmlFor="body"
                className="block text-sm font-medium text-slate-700"
              >
                Your review
              </label>
              <textarea
                id="body"
                name="body"
                rows={5}
                className={input}
                placeholder="What was it really like — rooms, food, staff, safety, the neighbourhood?"
              />
            </div>
          </ActionForm>
        </>
      )}
    </main>
  );
}

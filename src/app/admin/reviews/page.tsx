import { istDateTime } from '@/components/admin/status';
import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { type ActionResult, runAction } from '@/lib/action-result';
import {
  actorFor,
  requirePermission,
  requirePermissionForAction,
} from '@/lib/auth/guard';
import { listReviewsForModeration, moderateReview } from '@/lib/services/reviews';
import { revalidatePath } from 'next/cache';

export const metadata = {
  title: 'Reviews · #HashtagStay ops',
  robots: { index: false, follow: false },
};

async function moderateAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const user = await requirePermissionForAction('review:moderate');
    const decision =
      formData.get('decision') === 'published' ? 'published' : 'rejected';
    await moderateReview(
      String(formData.get('reviewId') ?? ''),
      decision,
      String(formData.get('note') ?? '') || null,
      { ...actorFor(user), id: user.id },
    );
    revalidatePath('/admin/reviews');
    return { ok: decision === 'published' ? 'Published.' : 'Rejected.' };
  });
}

export default async function ReviewsModerationPage() {
  await requirePermission('review:moderate', { returnTo: '/admin/reviews' });
  const rows = await listReviewsForModeration();

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reviews</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Every review comes from a resident who moved in. Publish honest ones,
          including critical ones; reject only abuse, personal data or off-topic
          content.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No reviews yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-slate-200 bg-white p-5 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    {r.propertyName} — {r.rating}/5
                    {r.safetyRating ? ` · safety ${r.safetyRating}/5` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.residentName ?? 'Resident'} · {istDateTime(r.createdAt)}
                  </p>
                </div>
                <Badge
                  tone={
                    r.moderationState === 'published'
                      ? 'success'
                      : r.moderationState === 'rejected'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {r.moderationState}
                </Badge>
              </div>
              {r.title && <p className="mt-2 font-medium text-slate-800">{r.title}</p>}
              <p className="mt-1 text-slate-700">{r.body}</p>
              {r.moderationState === 'pending' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionForm action={moderateAction} submitLabel="Publish" inline>
                    <input type="hidden" name="reviewId" value={r.id} />
                    <input type="hidden" name="decision" value="published" />
                  </ActionForm>
                  <ActionForm
                    action={moderateAction}
                    submitLabel="Reject"
                    tone="danger"
                    inline
                  >
                    <input type="hidden" name="reviewId" value={r.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <input
                      name="note"
                      placeholder="Reason"
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { revalidatePath } from 'next/cache';

import { ActionForm } from '@/components/ui/action-form';
import { type ActionResult, runAction } from '@/lib/action-result';
import {
  actorFor,
  requirePermission,
  requirePermissionForAction,
} from '@/lib/auth/guard';
import { moderatePhoto, pendingPhotoQueue } from '@/lib/services/media';

export const metadata = {
  title: 'Photos · Sandy Stays ops',
  robots: { index: false, follow: false },
};

async function moderateAction(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const user = await requirePermissionForAction('media:moderate');
    const decision = String(formData.get('decision') ?? '') as
      'approved' | 'rejected_quality' | 'rejected_other';
    await moderatePhoto(
      String(formData.get('mediaId') ?? ''),
      decision,
      String(formData.get('note') ?? '') || null,
      { ...actorFor(user), id: user.id },
    );
    revalidatePath('/admin/photos');
    return { ok: decision === 'approved' ? 'Approved.' : 'Rejected.' };
  });
}

export default async function PhotosPage() {
  await requirePermission('media:moderate', { returnTo: '/admin/photos' });
  const queue = await pendingPhotoQueue();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Photo moderation
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Photos from operators appear on the site only once approved. Exact copies of
          another property’s photo are rejected automatically.
        </p>
      </div>
      {queue.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No photos waiting.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queue.map((item) => (
            <li
              key={item.media.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs vary by provider */}
              <img
                src={item.url}
                alt={item.media.altText ?? item.propertyName}
                className="h-48 w-full object-cover"
              />
              <div className="space-y-2 p-3 text-sm">
                <p className="font-medium text-slate-900">{item.propertyName}</p>
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={moderateAction} submitLabel="Approve" inline>
                    <input type="hidden" name="mediaId" value={item.media.id} />
                    <input type="hidden" name="decision" value="approved" />
                  </ActionForm>
                  <ActionForm
                    action={moderateAction}
                    submitLabel="Poor quality"
                    tone="secondary"
                    inline
                  >
                    <input type="hidden" name="mediaId" value={item.media.id} />
                    <input type="hidden" name="decision" value="rejected_quality" />
                  </ActionForm>
                  <ActionForm
                    action={moderateAction}
                    submitLabel="Not this property"
                    tone="danger"
                    inline
                  >
                    <input type="hidden" name="mediaId" value={item.media.id} />
                    <input type="hidden" name="decision" value="rejected_other" />
                  </ActionForm>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

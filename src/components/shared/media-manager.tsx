import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import type { ActionResult } from '@/lib/action-result';
import { fileUrl } from '@/lib/integrations/storage';
import { DOCUMENT_KINDS, listDocuments, listPhotos } from '@/lib/services/media';

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

const STATE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  approved: 'success',
  pending: 'warning',
  rejected_duplicate: 'danger',
  rejected_quality: 'danger',
  rejected_other: 'danger',
};

/**
 * Photo and verification-document management, shared by the ops console and the
 * host portal. The caller supplies actions already scoped to its audience.
 */
export async function MediaManager({
  propertyId,
  uploadPhotos,
  photoCommand,
  uploadDocumentAction,
  storageReady,
}: {
  propertyId: string;
  uploadPhotos: Action;
  photoCommand: Action;
  uploadDocumentAction: Action;
  storageReady: boolean;
}) {
  const [photos, documents] = await Promise.all([
    listPhotos(propertyId, { publicOnly: false }),
    listDocuments({ propertyId }),
  ]);
  const documentLinks = await Promise.all(
    documents.map((d) => fileUrl('private', d.storagePath)),
  );

  return (
    <div className="space-y-6">
      {!storageReady && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          File storage is not configured on this deployment (SUPABASE_SECRET_KEY), so
          uploads are disabled.
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Photos</h2>
        <p className="mt-1 text-xs text-slate-500">
          JPEG, PNG or WebP up to 8 MB. The first approved photo is the cover. Operator
          uploads are reviewed before they appear.
        </p>
        {storageReady && (
          <ActionForm
            action={uploadPhotos}
            submitLabel="Upload photos"
            pendingLabel="Uploading…"
            className="mt-3 space-y-2"
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <input
              type="file"
              name="photos"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="block text-sm"
            />
          </ActionForm>
        )}
        {photos.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No photos yet. Listings with photos get far more enquiries.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs vary by provider */}
                <img
                  src={photo.url}
                  alt={photo.altText ?? 'Property photo'}
                  className="h-36 w-full object-cover"
                />
                <div className="space-y-2 p-2 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {index === 0 && <Badge tone="info">cover</Badge>}
                    <Badge tone={STATE_TONE[photo.moderationState] ?? 'muted'}>
                      {photo.moderationState.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  {photo.moderationNote && (
                    <p className="text-red-700">{photo.moderationNote}</p>
                  )}
                  <div className="flex gap-2">
                    {index !== 0 && (
                      <ActionForm
                        action={photoCommand}
                        submitLabel="Make cover"
                        tone="link"
                        inline
                      >
                        <input type="hidden" name="propertyId" value={propertyId} />
                        <input type="hidden" name="mediaId" value={photo.id} />
                        <input type="hidden" name="command" value="cover" />
                      </ActionForm>
                    )}
                    <ActionForm
                      action={photoCommand}
                      submitLabel="Remove"
                      tone="link"
                      inline
                      confirmMessage="Remove this photo?"
                    >
                      <input type="hidden" name="propertyId" value={propertyId} />
                      <input type="hidden" name="mediaId" value={photo.id} />
                      <input type="hidden" name="command" value="delete" />
                    </ActionForm>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Verification documents</h2>
        <p className="mt-1 text-xs text-slate-500">
          Private. Seen only by the operator and Sandy Stays’s verification team. PDF or
          image up to 10 MB.
        </p>
        {storageReady && (
          <ActionForm
            action={uploadDocumentAction}
            submitLabel="Upload document"
            pendingLabel="Uploading…"
            className="mt-3 space-y-2"
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <select
              name="kind"
              className="block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="file"
              name="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="block text-sm"
            />
          </ActionForm>
        )}
        {documents.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No documents uploaded.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {documents.map((doc, index) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="text-slate-900">
                    {DOCUMENT_KINDS.find((k) => k.value === doc.kind)?.label ??
                      doc.kind}
                  </span>
                  <span className="text-slate-500">
                    {' '}
                    · {doc.fileName} · {Math.round(doc.byteSize / 1024)} KB
                  </span>
                </span>
                <a
                  href={documentLinks[index]}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-700 underline"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MediaManager } from '@/components/shared/media-manager';
import { requirePermission } from '@/lib/auth/guard';
import { storageReady } from '@/lib/integrations/storage';
import { getPropertyDetail } from '@/lib/services/properties';

import { staffPhotoCommand, staffUploadDocument, staffUploadPhotos } from './actions';

export const metadata = {
  title: 'Photos and documents · #HashtagStay ops',
  robots: { index: false, follow: false },
};

export default async function PropertyMediaPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  await requirePermission('property:view', {
    returnTo: `/admin/properties/${id}/media`,
  });
  const detail = await getPropertyDetail(id);
  if (!detail) notFound();

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link
          href={`/admin/properties/${id}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {detail.property.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
          Photos and documents
        </h1>
      </div>
      <MediaManager
        propertyId={id}
        uploadPhotos={staffUploadPhotos}
        photoCommand={staffPhotoCommand}
        uploadDocumentAction={staffUploadDocument}
        storageReady={storageReady()}
      />
    </div>
  );
}

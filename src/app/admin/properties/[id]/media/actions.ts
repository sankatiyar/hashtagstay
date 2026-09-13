'use server';

import { revalidatePath } from 'next/cache';

import { type ActionResult, runAction } from '@/lib/action-result';
import { actorFor, requirePermissionForAction } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { properties } from '@/lib/db/schema';
import {
  deletePhoto,
  setCoverPhoto,
  uploadDocument,
  uploadPropertyPhoto,
} from '@/lib/services/media';
import { eq } from 'drizzle-orm';

const refresh = (propertyId: string) => {
  revalidatePath(`/admin/properties/${propertyId}/media`);
  revalidatePath('/admin/photos');
};

export async function staffUploadPhotos(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('media:upload');
    const propertyId = String(formData.get('propertyId') ?? '');
    const files = formData
      .getAll('photos')
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: 'Choose at least one image.' };
    const results = [];
    for (const file of files) {
      results.push(
        await uploadPropertyPhoto({
          propertyId,
          bytes: new Uint8Array(await file.arrayBuffer()),
          contentType: file.type,
          uploadedBy: user.id,
          autoApprove: can(user.roles, 'media:moderate'),
          actor: actorFor(user),
        }),
      );
    }
    refresh(propertyId);
    const duplicates = results.filter((r) => r.state === 'rejected_duplicate').length;
    return {
      ok: `${results.length} uploaded${duplicates ? `, ${duplicates} rejected as copies of another property's photos` : ''}.`,
    };
  });
}

export async function staffPhotoCommand(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('media:upload');
    const propertyId = String(formData.get('propertyId') ?? '');
    const mediaId = String(formData.get('mediaId') ?? '');
    if (formData.get('command') === 'delete')
      await deletePhoto(mediaId, actorFor(user));
    else await setCoverPhoto(propertyId, mediaId);
    refresh(propertyId);
    return { ok: 'Updated.' };
  });
}

export async function staffUploadDocument(
  _p: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction('media:upload');
    const propertyId = String(formData.get('propertyId') ?? '');
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file.' };
    const [property] = await db
      .select({ organizationId: properties.organizationId })
      .from(properties)
      .where(eq(properties.id, propertyId));
    if (!property) return { error: 'Property not found.' };
    await uploadDocument({
      organizationId: property.organizationId,
      propertyId,
      kind: String(formData.get('kind') ?? 'other'),
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      uploadedBy: user.id,
      actor: actorFor(user),
    });
    refresh(propertyId);
    return { ok: 'Document uploaded.' };
  });
}

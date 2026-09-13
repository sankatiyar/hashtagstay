import { createHash, randomUUID } from 'node:crypto';

import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import { type AuditActor, audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { media, properties, propertyDocuments } from '@/lib/db/schema';
import {
  DOCUMENT_TYPES,
  IMAGE_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  fileUrl,
  putFile,
  sniffMatches,
} from '@/lib/integrations/storage';

/**
 * Listing photos (FR-02) and verification documents (FR-16).
 *
 * Photos start as `pending` and only appear on the public site once moderated.
 * Each upload's content hash is stored, and an identical image already used by a
 * different property is rejected on arrival: host-supplied photos are routinely
 * copied from other listings.
 *
 * The hash catches exact copies only. Near-duplicate detection (a resized or
 * re-compressed copy) needs a perceptual hash computed from decoded pixels,
 * which requires an image library this project does not yet include.
 */

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

const contentHash = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export async function uploadPropertyPhoto(input: {
  propertyId: string;
  bytes: Uint8Array;
  contentType: string;
  altText?: string | null;
  uploadedBy: string;
  /** Staff uploads can be auto-approved; host uploads always go to moderation. */
  autoApprove?: boolean;
  actor: AuditActor;
}): Promise<{ mediaId: string; state: string }> {
  const extension = IMAGE_TYPES[input.contentType];
  if (!extension) throw new MediaError('Upload a JPEG, PNG or WebP image.');
  if (input.bytes.byteLength > MAX_IMAGE_BYTES)
    throw new MediaError('Images must be under 8 MB.');
  if (!sniffMatches(input.bytes, input.contentType)) {
    throw new MediaError('That file is not a valid image of the type it claims to be.');
  }

  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, input.propertyId));
  if (!property) throw new MediaError('Property not found.');

  const hash = contentHash(input.bytes);
  const [duplicate] = await db
    .select({ propertyId: media.propertyId, name: properties.name })
    .from(media)
    .innerJoin(properties, eq(properties.id, media.propertyId))
    .where(
      and(
        eq(media.perceptualHash, hash),
        ne(media.propertyId, input.propertyId),
        isNull(media.deletedAt),
      ),
    )
    .limit(1);

  const path = `properties/${input.propertyId}/${randomUUID()}.${extension}`;
  await putFile({
    visibility: 'public',
    path,
    bytes: input.bytes,
    contentType: input.contentType,
  });

  const [{ nextOrder }] = await db
    .select({ nextOrder: sql<number>`coalesce(max(${media.sortOrder}), -1)::int + 1` })
    .from(media)
    .where(eq(media.propertyId, input.propertyId));

  const state = duplicate
    ? 'rejected_duplicate'
    : input.autoApprove
      ? 'approved'
      : 'pending';
  const [row] = await db
    .insert(media)
    .values({
      propertyId: input.propertyId,
      kind: 'image',
      storagePath: path,
      altText: input.altText?.trim() || null,
      byteSize: input.bytes.byteLength,
      sortOrder: nextOrder,
      moderationState: state,
      moderatedAt: state === 'pending' ? null : new Date(),
      moderatedBy: state === 'approved' ? input.uploadedBy : null,
      moderationNote: duplicate
        ? `Identical image already used by ${duplicate.name}.`
        : null,
      perceptualHash: hash,
      uploadedBy: input.uploadedBy,
    })
    .returning({ id: media.id });

  await audit({
    actor: input.actor,
    action: 'create',
    entityType: 'media',
    entityId: row.id,
    after: { propertyId: input.propertyId, state },
  });
  return { mediaId: row.id, state };
}

export async function moderatePhoto(
  mediaId: string,
  decision: 'approved' | 'rejected_quality' | 'rejected_other',
  note: string | null,
  actor: AuditActor & { id: string },
): Promise<void> {
  await db
    .update(media)
    .set({
      moderationState: decision,
      moderatedBy: actor.id,
      moderatedAt: new Date(),
      moderationNote: note,
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId));
  await audit({
    actor,
    action: 'state_transition',
    entityType: 'media',
    entityId: mediaId,
    after: { state: decision, note },
  });
}

export async function deletePhoto(mediaId: string, actor: AuditActor): Promise<void> {
  await db
    .update(media)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(media.id, mediaId));
  await audit({ actor, action: 'delete', entityType: 'media', entityId: mediaId });
}

export async function setCoverPhoto(
  propertyId: string,
  mediaId: string,
): Promise<void> {
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.propertyId, propertyId), isNull(media.deletedAt)))
    .orderBy(asc(media.sortOrder));
  const ordered = [mediaId, ...rows.map((r) => r.id).filter((id) => id !== mediaId)];
  for (const [index, id] of ordered.entries()) {
    await db.update(media).set({ sortOrder: index }).where(eq(media.id, id));
  }
}

/** Photos for a property with loadable URLs. `publicOnly` hides unmoderated ones. */
export async function listPhotos(propertyId: string, options: { publicOnly: boolean }) {
  const rows = await db
    .select()
    .from(media)
    .where(
      options.publicOnly
        ? and(
            eq(media.propertyId, propertyId),
            eq(media.moderationState, 'approved'),
            isNull(media.deletedAt),
          )
        : and(eq(media.propertyId, propertyId), isNull(media.deletedAt)),
    )
    .orderBy(asc(media.sortOrder), asc(media.createdAt));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await fileUrl('public', row.storagePath),
    })),
  );
}

/** Cover photo URL per property, for cards. */
export async function coverPhotos(propertyIds: string[]): Promise<Map<string, string>> {
  if (propertyIds.length === 0) return new Map();
  const rows = await db
    .select({
      propertyId: media.propertyId,
      storagePath: media.storagePath,
      sortOrder: media.sortOrder,
    })
    .from(media)
    .where(
      and(
        sql`${media.propertyId} = ANY(${propertyIds})`,
        eq(media.moderationState, 'approved'),
        isNull(media.deletedAt),
      ),
    )
    .orderBy(asc(media.sortOrder));
  const covers = new Map<string, string>();
  for (const row of rows) {
    if (!covers.has(row.propertyId))
      covers.set(row.propertyId, await fileUrl('public', row.storagePath));
  }
  return covers;
}

export async function pendingPhotoQueue() {
  const rows = await db
    .select({ media, propertyName: properties.name })
    .from(media)
    .innerJoin(properties, eq(properties.id, media.propertyId))
    .where(and(eq(media.moderationState, 'pending'), isNull(media.deletedAt)))
    .orderBy(asc(media.createdAt))
    .limit(100);
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await fileUrl('public', row.media.storagePath),
    })),
  );
}

// --- Verification documents -------------------------------------------------

export const DOCUMENT_KINDS = [
  { value: 'ownership_proof', label: 'Ownership proof (sale deed, tax receipt)' },
  { value: 'lease', label: 'Lease or rent agreement allowing subletting' },
  { value: 'id_proof', label: 'Operator ID (PAN, Aadhaar, passport)' },
  { value: 'registration', label: 'Company registration (CIN / GST certificate)' },
  { value: 'other', label: 'Other supporting document' },
] as const;

export async function uploadDocument(input: {
  organizationId: string;
  propertyId: string | null;
  kind: string;
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
  uploadedBy: string;
  actor: AuditActor;
}): Promise<string> {
  const extension = DOCUMENT_TYPES[input.contentType];
  if (!extension) throw new MediaError('Upload a PDF, JPEG, PNG or WebP file.');
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new MediaError('Documents must be under 10 MB.');
  if (!sniffMatches(input.bytes, input.contentType)) {
    throw new MediaError(
      'That file is not a valid document of the type it claims to be.',
    );
  }
  if (!DOCUMENT_KINDS.some((k) => k.value === input.kind))
    throw new MediaError('Choose a document type.');

  const path = `organizations/${input.organizationId}/${randomUUID()}.${extension}`;
  await putFile({
    visibility: 'private',
    path,
    bytes: input.bytes,
    contentType: input.contentType,
  });

  const [row] = await db
    .insert(propertyDocuments)
    .values({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      kind: input.kind,
      fileName: input.fileName.replace(/[^\w.\- ]/g, '_').slice(0, 150),
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
      storagePath: path,
      uploadedBy: input.uploadedBy,
    })
    .returning({ id: propertyDocuments.id });

  await audit({
    actor: input.actor,
    action: 'create',
    entityType: 'property_documents',
    entityId: row.id,
    after: { kind: input.kind, propertyId: input.propertyId },
  });
  return row.id;
}

export async function listDocuments(filters: {
  organizationId?: string;
  propertyId?: string;
}) {
  const rows = await db
    .select()
    .from(propertyDocuments)
    .where(
      filters.propertyId
        ? eq(propertyDocuments.propertyId, filters.propertyId)
        : filters.organizationId
          ? eq(propertyDocuments.organizationId, filters.organizationId)
          : undefined,
    )
    .orderBy(desc(propertyDocuments.createdAt));
  return rows;
}

export async function documentById(id: string) {
  const [row] = await db
    .select()
    .from(propertyDocuments)
    .where(eq(propertyDocuments.id, id));
  return row ?? null;
}

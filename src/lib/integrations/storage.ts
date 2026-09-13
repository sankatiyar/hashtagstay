import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';

import { clientEnv, serverEnv } from '@/lib/env';

/**
 * File storage for listing photos (public) and verification documents
 * (private).
 *
 * Two providers:
 *
 *  - **Supabase Storage**, when `SUPABASE_SECRET_KEY` is set. Photos go to a
 *    public bucket; documents to a private bucket read through short-lived
 *    signed URLs.
 *  - **Local disk** otherwise, under `.uploads/` (gitignored), served by
 *    `/api/files/...`. This is what makes upload work on a development machine
 *    before the Supabase key exists. It is refused in production, where local
 *    disk on a serverless host is ephemeral and files would silently vanish.
 */

export type StorageVisibility = 'public' | 'private';

const BUCKET: Record<StorageVisibility, string> = {
  public: 'listing-media',
  private: 'verification-documents',
};

const LOCAL_ROOT = join(process.cwd(), '.uploads');

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

function provider(): 'supabase' | 'local' {
  if (serverEnv().SUPABASE_SECRET_KEY) return 'supabase';
  if (serverEnv().NODE_ENV === 'production') {
    throw new StorageError(
      'File storage is not configured: set SUPABASE_SECRET_KEY. Local disk storage ' +
        'is disabled in production because serverless disks are ephemeral.',
    );
  }
  return 'local';
}

/** Whether uploads can work on this deployment, for screens to explain themselves. */
export function storageReady(): boolean {
  try {
    provider();
    return true;
  } catch {
    return false;
  }
}

/**
 * Reject traversal and absolute paths. Storage paths are built by our own code,
 * but they include ids and file extensions derived from user input, so the
 * check is cheap insurance against a crafted value escaping the upload root.
 */
export function assertSafePath(path: string): string {
  const cleaned = normalize(path).replaceAll('\\', '/');
  if (
    cleaned.startsWith('/') ||
    cleaned.startsWith('..') ||
    cleaned.includes('/../') ||
    /^[a-zA-Z]:/.test(cleaned) ||
    !/^[a-zA-Z0-9/_.-]+$/.test(cleaned)
  ) {
    throw new StorageError(`Unsafe storage path: ${path}`);
  }
  return cleaned;
}

const supabaseBase = () => clientEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');

function supabaseHeaders(contentType?: string): Record<string, string> {
  const key = serverEnv().SUPABASE_SECRET_KEY!;
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

export async function putFile(params: {
  visibility: StorageVisibility;
  path: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{ path: string }> {
  const path = assertSafePath(params.path);

  if (provider() === 'local') {
    const target = join(LOCAL_ROOT, params.visibility, ...path.split('/'));
    if (!target.startsWith(join(LOCAL_ROOT, params.visibility) + sep)) {
      throw new StorageError('Resolved path escaped the upload root.');
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, params.bytes);
    return { path };
  }

  const response = await fetch(
    `${supabaseBase()}/storage/v1/object/${BUCKET[params.visibility]}/${path}`,
    {
      method: 'POST',
      headers: { ...supabaseHeaders(params.contentType), 'x-upsert': 'false' },
      body: Buffer.from(params.bytes),
    },
  );
  if (!response.ok) {
    throw new StorageError(
      `Supabase upload failed (${response.status}): ${await response.text()}`,
    );
  }
  return { path };
}

/** A URL the browser can load. Public files are stable; private ones expire. */
export async function fileUrl(
  visibility: StorageVisibility,
  path: string,
  expiresInSeconds = 300,
): Promise<string> {
  const safe = assertSafePath(path);

  if (provider() === 'local') {
    return `/api/files/${visibility}/${safe}`;
  }

  if (visibility === 'public') {
    return `${supabaseBase()}/storage/v1/object/public/${BUCKET.public}/${safe}`;
  }

  const response = await fetch(
    `${supabaseBase()}/storage/v1/object/sign/${BUCKET.private}/${safe}`,
    {
      method: 'POST',
      headers: supabaseHeaders('application/json'),
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    },
  );
  if (!response.ok) {
    throw new StorageError(`Could not sign document URL (${response.status}).`);
  }
  const { signedURL } = (await response.json()) as { signedURL: string };
  return `${supabaseBase()}/storage/v1${signedURL}`;
}

/** Read a locally stored file. Only meaningful for the local provider. */
export async function readLocalFile(
  visibility: StorageVisibility,
  path: string,
): Promise<Buffer> {
  const safe = assertSafePath(path);
  const target = join(LOCAL_ROOT, visibility, ...safe.split('/'));
  if (!target.startsWith(join(LOCAL_ROOT, visibility) + sep)) {
    throw new StorageError('Resolved path escaped the upload root.');
  }
  return readFile(target);
}

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const DOCUMENT_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  'application/pdf': 'pdf',
};

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Confirm a file's leading bytes match its declared type. The browser-supplied
 * content type is attacker-controlled; a PDF renamed .jpg, or HTML labelled as
 * an image, must not be stored as if it were what it claims.
 */
export function sniffMatches(bytes: Uint8Array, contentType: string): boolean {
  const b = bytes;
  switch (contentType) {
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    case 'image/webp':
      return (
        b[0] === 0x52 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x46 &&
        b[8] === 0x57 &&
        b[9] === 0x45 &&
        b[10] === 0x42 &&
        b[11] === 0x50
      );
    case 'application/pdf':
      return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    default:
      return false;
  }
}

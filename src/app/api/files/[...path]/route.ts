import { NextResponse } from 'next/server';

import { hostMemberships } from '@/lib/auth/host';
import { can } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import { StorageError, readLocalFile } from '@/lib/integrations/storage';

/**
 * Serves locally stored uploads in development (the local storage provider).
 *
 * `public/...` is listing photography and is served to anyone. `private/...`
 * is verification documents — ownership deeds, ID — and is served only to staff
 * who can view inventory, or to a host who belongs to the owning organization.
 */

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const [visibility, ...rest] = path;
  const relative = rest.join('/');

  if (visibility !== 'public' && visibility !== 'private') {
    return new NextResponse('Not found', { status: 404 });
  }

  if (visibility === 'private') {
    const user = await getCurrentUser();
    if (!user) return new NextResponse('Not found', { status: 404 });

    let allowed = user.audience === 'staff' && can(user.roles, 'property:view');
    if (!allowed && user.audience === 'host') {
      const orgId = relative.match(/^organizations\/([0-9a-f-]{36})\//)?.[1];
      const memberships = await hostMemberships(user.id);
      allowed = Boolean(orgId && memberships.some((m) => m.organizationId === orgId));
    }
    // 404 rather than 403, so the endpoint does not confirm a document exists.
    if (!allowed) return new NextResponse('Not found', { status: 404 });
  }

  try {
    const bytes = await readLocalFile(visibility, relative);
    const extension = relative.split('.').pop() ?? '';
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': TYPES[extension] ?? 'application/octet-stream',
        'Cache-Control':
          visibility === 'public' ? 'public, max-age=86400' : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(visibility === 'private' ? { 'Content-Disposition': 'inline' } : {}),
      },
    });
  } catch (error) {
    if (error instanceof StorageError)
      return new NextResponse('Not found', { status: 404 });
    return new NextResponse('Not found', { status: 404 });
  }
}

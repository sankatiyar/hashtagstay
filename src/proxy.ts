import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Proxy — what earlier Next.js versions called middleware (renamed in 16 to
 * reflect that it is a network-boundary concern). Runs on the Node runtime;
 * the edge runtime is not supported here.
 *
 * This is an **optimistic check only**. It looks for the presence of a session
 * cookie so that an unauthenticated visitor gets a redirect instead of a
 * flash of empty console, and nothing more. It deliberately does not:
 *
 *   - validate the session against the database
 *   - resolve roles or check permissions
 *
 * Authorization lives in `lib/auth/guard.ts`, in the data path. The Next.js
 * docs are explicit that proxy must not be used as a session or authorization
 * solution, and a cookie's presence says nothing about whether it is valid,
 * revoked, or belongs to a disabled account. Treat everything here as a UX
 * nicety that an attacker can trivially satisfy.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  if (!hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Guard the console, but never the sign-in page itself (which would loop) or
   * the denied page (which a signed-in user needs to be able to read).
   */
  matcher: ['/admin/((?!login|denied).*)'],
};

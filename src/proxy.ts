import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { ATTRIBUTION_COOKIE } from '@/lib/attribution';
import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Proxy (Next.js 16's name for middleware). Two jobs, both optimistic:
 *
 * 1. **First-touch attribution (FR-07).** The first time a visitor arrives with
 *    UTM parameters, an ad click id or an external referrer, record them in a
 *    cookie so the enquiry they submit later — often on a different page — is
 *    attributed to the campaign that brought them. First touch is kept: a later
 *    direct visit must not overwrite the paid click that started the journey.
 *
 * 2. **Redirect signed-out visitors** away from the staff console, host portal
 *    and resident account, for a nicer experience. This checks only that a
 *    session cookie exists. Real authorization happens in the data path
 *    (lib/auth/guard.ts, lib/auth/host.ts): Next.js is explicit that proxy must
 *    not be an authorization layer.
 */

const ATTRIBUTION_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
] as const;

const CAMEL: Record<(typeof ATTRIBUTION_PARAMS)[number], string> = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
  gclid: 'gclid',
  fbclid: 'fbclid',
};

const PROTECTED: { prefix: string; login: string; open: string[] }[] = [
  { prefix: '/admin', login: '/admin/login', open: ['/admin/login', '/admin/denied'] },
  { prefix: '/host', login: '/host/login', open: ['/host/login', '/host/signup'] },
  { prefix: '/account', login: '/account/login', open: ['/account/login'] },
];

export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  for (const area of PROTECTED) {
    if (pathname === area.prefix || pathname.startsWith(`${area.prefix}/`)) {
      const isOpen = area.open.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (!isOpen && !request.cookies.has(SESSION_COOKIE)) {
        const url = request.nextUrl.clone();
        url.pathname = area.login;
        url.search = `?next=${encodeURIComponent(pathname + search)}`;
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }
  }

  const response = NextResponse.next();
  if (request.cookies.has(ATTRIBUTION_COOKIE)) return response;

  const captured: Record<string, string> = {};
  for (const param of ATTRIBUTION_PARAMS) {
    const value = searchParams.get(param);
    if (value) captured[CAMEL[param]] = value.slice(0, 300);
  }

  const referrer = request.headers.get('referer');
  let externalReferrer: string | null = null;
  if (referrer) {
    try {
      if (new URL(referrer).host !== request.nextUrl.host)
        externalReferrer = referrer.slice(0, 500);
    } catch {
      externalReferrer = null;
    }
  }

  if (Object.keys(captured).length === 0 && !externalReferrer) return response;

  captured.landingPagePath = pathname.slice(0, 300);
  if (externalReferrer) captured.referrerUrl = externalReferrer;

  response.cookies.set(
    ATTRIBUTION_COOKIE,
    encodeURIComponent(JSON.stringify(captured)),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    },
  );
  return response;
}

export const config = {
  // Everything except Next internals, API routes and static files.
  matcher: [
    '/((?!_next/|api/|favicon.ico|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)',
  ],
};

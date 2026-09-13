import { NextResponse } from 'next/server';

import { trackEvent } from '@/lib/services/events';

/**
 * Client beacon for events that only the browser can see — currently just a
 * listing view, which the host portal's performance numbers are built on
 * (PRD Journey B step 6). Listing pages are statically generated, so the view
 * cannot be recorded during render. Only allowlisted events are accepted.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: { name?: string; propertyId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (
    body.name !== 'listing.viewed' ||
    !body.propertyId ||
    !UUID.test(body.propertyId)
  ) {
    return new NextResponse(null, { status: 400 });
  }
  // Crawlers would inflate operators' view counts.
  const agent = request.headers.get('user-agent') ?? '';
  if (/bot|crawl|spider|slurp|lighthouse/i.test(agent))
    return new NextResponse(null, { status: 204 });

  await trackEvent({ name: 'listing.viewed', propertyId: body.propertyId });
  return new NextResponse(null, { status: 204 });
}

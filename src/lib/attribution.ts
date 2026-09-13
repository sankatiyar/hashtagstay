/**
 * Lead-source attribution (FR-07).
 *
 * Attribution is captured once, when the lead is created, because it cannot be
 * reconstructed afterwards — and cost-per-lead and channel ROI (PRD §12) are
 * meaningless without it. The raw UTM values are stored as well as the
 * inferred channel, so a misclassification can be corrected later without
 * having lost the evidence.
 */

export type LeadChannel =
  | 'organic_search'
  | 'paid_search'
  | 'paid_social'
  | 'organic_social'
  | 'direct'
  | 'referral'
  | 'partner'
  | 'whatsapp'
  | 'click_to_call'
  | 'offline';

export interface AttributionInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrerUrl?: string | null;
  landingPagePath?: string | null;
}

const SEARCH_ENGINES = ['google.', 'bing.', 'duckduckgo.', 'yahoo.', 'ecosia.'];
const SOCIAL_SITES = [
  'facebook.',
  'instagram.',
  'linkedin.',
  't.co',
  'twitter.',
  'x.com',
  'youtube.',
  'reddit.',
  'quora.',
];
const PAID_MEDIUMS = ['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'sem'];
const PAID_SOCIAL_MEDIUMS = ['paid_social', 'paidsocial', 'social_paid'];
const SOCIAL_SOURCES = ['facebook', 'instagram', 'meta', 'fb', 'ig', 'linkedin'];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Infer the acquisition channel. Paid signals win over organic ones, because a
 * paid click that arrives via a Google referrer is still a paid click and must
 * be counted against that spend.
 */
export function inferChannel(input: AttributionInput, ownHost?: string): LeadChannel {
  const medium = input.utmMedium?.trim().toLowerCase() ?? '';
  const source = input.utmSource?.trim().toLowerCase() ?? '';

  if (input.gclid) return 'paid_search';
  if (input.fbclid && PAID_MEDIUMS.includes(medium)) return 'paid_social';
  if (PAID_SOCIAL_MEDIUMS.includes(medium)) return 'paid_social';
  if (PAID_MEDIUMS.includes(medium)) {
    return SOCIAL_SOURCES.includes(source) ? 'paid_social' : 'paid_search';
  }
  if (medium === 'partner' || medium === 'university' || medium === 'agent')
    return 'partner';
  if (medium === 'referral' || medium === 'affiliate') return 'referral';
  if (source === 'whatsapp' || medium === 'whatsapp') return 'whatsapp';
  if (medium === 'social' || medium === 'organic_social') return 'organic_social';
  if (medium === 'organic' || medium === 'seo') return 'organic_search';

  const host = hostOf(input.referrerUrl);
  if (host && (!ownHost || !host.endsWith(ownHost))) {
    if (SEARCH_ENGINES.some((engine) => host.includes(engine))) return 'organic_search';
    if (SOCIAL_SITES.some((site) => host.includes(site))) {
      return input.fbclid ? 'organic_social' : 'organic_social';
    }
    return 'referral';
  }

  if (input.fbclid) return 'organic_social';
  return 'direct';
}

/** Trim and cap a raw attribution value so hostile input cannot bloat rows. */
export function cleanAttributionValue(
  value: string | null | undefined,
  max = 300,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function cleanAttribution(input: AttributionInput): Required<AttributionInput> {
  return {
    utmSource: cleanAttributionValue(input.utmSource, 120),
    utmMedium: cleanAttributionValue(input.utmMedium, 120),
    utmCampaign: cleanAttributionValue(input.utmCampaign, 200),
    utmTerm: cleanAttributionValue(input.utmTerm, 200),
    utmContent: cleanAttributionValue(input.utmContent, 200),
    gclid: cleanAttributionValue(input.gclid, 200),
    fbclid: cleanAttributionValue(input.fbclid, 300),
    referrerUrl: cleanAttributionValue(input.referrerUrl, 500),
    landingPagePath: cleanAttributionValue(input.landingPagePath, 500),
  };
}

/** Cookie name carrying first-touch attribution from landing to enquiry. */
export const ATTRIBUTION_COOKIE = 'hs_attr';

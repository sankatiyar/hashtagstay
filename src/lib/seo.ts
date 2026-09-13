import { clientEnv } from '@/lib/env';

/**
 * SEO helpers.
 *
 * The PRD makes SEO/SEM the primary acquisition channel (§4A) but never states
 * an indexability requirement, which is the single biggest reason this app is
 * server-rendered rather than a SPA. Everything a crawler needs — absolute
 * canonical URLs, structured data, sitemaps — is built here so no page has to
 * remember it.
 */

/** Absolute site origin, without a trailing slash. */
export function siteUrl(): string {
  return clientEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
}

/** Absolute URL for a path. Canonical tags and structured data need absolute. */
export function absoluteUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${siteUrl()}${suffix}`;
}

export const BRAND = 'Sandy Stays';

/**
 * Page title. Kept under roughly 60 characters before the brand suffix, since
 * Google truncates beyond that and a cut-off title reads as broken.
 */
export function pageTitle(title: string): string {
  return `${title} | ${BRAND}`;
}

/**
 * JSON-LD for a listing.
 *
 * `Accommodation` with an `offers` block is what lets a rent range appear in
 * results. Two deliberate omissions:
 *
 *  - **No `telephone`.** Structured data is published to the world; putting an
 *    operator's number in it would defeat the masked-number model entirely.
 *  - **No `aggregateRating`.** Reviews are Phase 2 and we have none. Emitting a
 *    rating we cannot substantiate is both a policy violation and a lie.
 */
export function listingJsonLd(listing: {
  name: string;
  slug: string;
  description: string | null;
  addressLine1: string;
  locality: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string;
  location: { x: number; y: number } | null;
  propertyType: string;
  amenities: string[];
  fromRentMinor: number | null;
  currency: string;
}) {
  const url = absoluteUrl(`/stays/${listing.slug}`);

  return {
    '@context': 'https://schema.org',
    '@type': 'Accommodation',
    name: listing.name,
    url,
    ...(listing.description ? { description: listing.description } : {}),
    additionalType: schemaTypeFor(listing.propertyType),
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.addressLine1,
      ...(listing.locality ? { addressLocality: listing.locality } : {}),
      addressRegion: listing.state ?? listing.city,
      ...(listing.postalCode ? { postalCode: listing.postalCode } : {}),
      addressCountry: listing.country,
    },
    ...(listing.location
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: listing.location.y,
            longitude: listing.location.x,
          },
        }
      : {}),
    amenityFeature: listing.amenities.map((slug) => ({
      '@type': 'LocationFeatureSpecification',
      name: slug.replaceAll('_', ' '),
      value: true,
    })),
    ...(listing.fromRentMinor !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: (listing.fromRentMinor / 100).toFixed(2),
            priceCurrency: listing.currency,
            // Rent is monthly; without this the price reads as a nightly rate.
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: (listing.fromRentMinor / 100).toFixed(2),
              priceCurrency: listing.currency,
              unitCode: 'MON',
            },
            availability: 'https://schema.org/InStock',
            url,
          },
        }
      : {}),
  };
}

function schemaTypeFor(propertyType: string): string {
  switch (propertyType) {
    case 'pbsa':
      return 'https://schema.org/Residence';
    case 'homeshare':
      return 'https://schema.org/Apartment';
    default:
      return 'https://schema.org/Residence';
  }
}

/** Breadcrumb structured data, so results show a path rather than a bare URL. */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** Organisation identity, emitted once on the home page. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Sandy Stays',
    url: siteUrl(),
    description:
      'Aggregator for verified co-living and student housing in India. Discover online, and a relationship manager helps you close over the phone.',
  };
}

/**
 * FAQ structured data for landing pages.
 *
 * Only emit this where the questions are genuinely answered on the page —
 * fabricating Q&A to win a rich result is exactly what gets a site penalised.
 */
export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/** Render a JSON-LD script tag's props. */
export const jsonLdScript = (data: unknown) => ({
  type: 'application/ld+json' as const,
  dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
});

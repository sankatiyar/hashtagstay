import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo';
import {
  listLiveCities,
  listLiveListingSlugs,
  listPublishedInstitutions,
} from '@/lib/services/public-search';

/**
 * Sitemap.
 *
 * Generated from live data rather than hand-maintained, so a newly published
 * listing is discoverable without anyone remembering to add it — and an
 * unpublished one disappears from the sitemap the moment it stops being live.
 *
 * Only public pages appear. The ops console is `noindex` and must never be
 * listed here.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, cities, campuses] = await Promise.all([
    listLiveListingSlugs(),
    listLiveCities(),
    listPublishedInstitutions(),
  ]);

  const citySlug = (city: string) => city.toLowerCase().replaceAll(' ', '-');

  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/search'),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    ...cities.map((entry) => ({
      url: absoluteUrl(`/city/${citySlug(entry.city)}`),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...campuses.map((campus) => ({
      url: absoluteUrl(`/near/${campus.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...listings.map((listing) => ({
      url: absoluteUrl(`/stays/${listing.slug}`),
      // Real modification time, so a crawler can prioritise what changed.
      lastModified: listing.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}

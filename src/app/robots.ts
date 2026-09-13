import type { MetadataRoute } from 'next';

import { absoluteUrl, siteUrl } from '@/lib/seo';

/**
 * robots.txt.
 *
 * The internal surfaces are disallowed here *and* marked `noindex` in their own
 * metadata. Belt and braces on purpose: robots.txt asks a crawler not to fetch
 * a path, while `noindex` keeps a page out of results even if it is reached by
 * some other route — a shared link, for instance. Neither alone is sufficient,
 * and an indexed ops console would leak resident PII into search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          // RM-curated shortlists are shared with one resident by token and
          // must never be crawled.
          '/shortlist/',
          '/enquiry/thanks',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteUrl(),
  };
}

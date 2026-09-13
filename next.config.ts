import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photo and document uploads go through Server Actions (8–10 MB caps in
      // lib/services/media, plus multipart overhead). Vercel's own request cap
      // (4.5 MB) still applies there; larger files need direct-to-storage upload.
      bodySizeLimit: '11mb',
    },
    // The build prerenders every live listing (well over a thousand pages), all
    // reading the database. Retry a page a few times so one dropped pooler
    // connection does not fail a whole production deploy.
    staticGenerationRetryCount: 3,
  },
};

export default nextConfig;

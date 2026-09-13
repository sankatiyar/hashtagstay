import { PHOTOS, type PhotoKey, photoSrcSet, photoUrl } from '@/lib/photos';

/**
 * A responsive photograph from the catalogue in `lib/photos`. A plain <img>:
 * the Unsplash CDN already resizes and picks the format, so running it through
 * the Next.js image optimiser would only spend the hosting plan's quota.
 */
export function Photo({
  name,
  aspect = 4 / 3,
  sizes = '(min-width: 1024px) 33vw, 100vw',
  className = '',
  priority = false,
  alt,
}: {
  name: PhotoKey;
  /** Width divided by height, used to crop at the CDN. */
  aspect?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
  /** Override the catalogue's alt text; pass "" for a decorative image. */
  alt?: string;
}) {
  const photo = PHOTOS[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the CDN resizes; see above
    <img
      src={photoUrl(photo.id, 1200, Math.round(1200 / aspect))}
      srcSet={photoSrcSet(photo.id, aspect)}
      sizes={sizes}
      alt={alt ?? photo.alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

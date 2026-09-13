/**
 * "Where you'll be" — an approximate-area map for a listing, in the style of
 * the big accommodation marketplaces.
 *
 * It shows a neighbourhood rather than pinpointing a building: the map is
 * centred on a point offset from the property by roughly 100–250 m (stable per
 * listing, so it does not jump on reload) and marked with a shaded circle
 * instead of a pin. That is what a resident needs to judge the area and the
 * commute; campus distances elsewhere on the page are still measured from the
 * property itself.
 *
 * OpenStreetMap's embed needs no API key and no client JavaScript, so this
 * stays a server component and the listing page stays statically renderable.
 */

interface ListingMapProps {
  lat: number;
  lng: number;
  /** Stable per listing (its slug), so the approximate centre never moves. */
  seed: string;
  /** Human place name, for the iframe title. */
  label: string;
}

/** FNV-1a: a small, stable hash to derive the offset from the seed. */
function hash(text: string): number {
  let value = 2_166_136_261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16_777_619);
  }
  return value >>> 0;
}

/** Shift a point 100–250 m in a direction derived from the seed. */
export function approximateCentre(lat: number, lng: number, seed: string) {
  const h = hash(seed);
  const bearing = ((h % 360) * Math.PI) / 180;
  const km = 0.1 + ((h >>> 9) % 100) * 0.0015;
  return {
    lat: lat + (km * Math.cos(bearing)) / 110.574,
    lng: lng + (km * Math.sin(bearing)) / (111.32 * Math.cos((lat * Math.PI) / 180)),
  };
}

export function ListingMap({ lat, lng, seed, label }: ListingMapProps) {
  const centre = approximateCentre(lat, lng, seed);
  // Roughly a 2 km by 3.5 km window: enough to read the neighbourhood and the
  // roads around it.
  const latSpan = 0.009;
  const lngSpan = 0.016;
  const bbox = [
    centre.lng - lngSpan,
    centre.lat - latSpan,
    centre.lng + lngSpan,
    centre.lat + latSpan,
  ]
    .map((value) => value.toFixed(5))
    .join(',');
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
  const larger = `https://www.openstreetmap.org/#map=15/${centre.lat.toFixed(4)}/${centre.lng.toFixed(4)}`;

  return (
    <div>
      <div className="border-line bg-sand relative h-[320px] overflow-hidden rounded-2xl border sm:h-[440px]">
        <iframe
          title={`Map of the area around ${label}`}
          src={embed}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full border-0"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="border-brand-600/50 bg-brand-500/20 flex h-44 w-44 items-center justify-center rounded-full border-2">
            <span className="bg-brand-600 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-(--shadow-lift)">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                <path
                  d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
      <p className="text-ink-soft mt-2 text-xs">
        <a
          href={larger}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink font-semibold underline"
        >
          View larger map
        </a>{' '}
        · Map data © OpenStreetMap contributors
      </p>
    </div>
  );
}

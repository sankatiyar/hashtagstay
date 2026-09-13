/**
 * Listing cover image.
 *
 * Shows the property's own cover photo when it has an approved one. Otherwise it
 * draws an illustration seeded from the slug, so every listing gets a distinct,
 * stable image. The fallback is deliberately an illustration, not a stock photo:
 * a stock bedroom on a verification-led site would imply "this is the room",
 * which is exactly the claim we refuse to make without checking.
 */

const PALETTES: readonly [sky: string, skyEnd: string, building: string, light: string][] = [
  ['#fdba74', '#f97316', '#7c2d12', '#fff3e8'],
  ['#fed7aa', '#fb923c', '#9a3412', '#ffffff'],
  ['#ffd0a8', '#f2842f', '#7c2d12', '#ffe4cc'],
  ['#fb923c', '#ea580c', '#431407', '#fed7aa'],
];


function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG, so the same slug always draws the same building. */
function random(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function ListingCover({
  seed,
  photoUrl,
  alt,
  className = '',
}: {
  seed: string;
  photoUrl?: string | null;
  alt: string;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- storage URLs vary by provider
      <img src={photoUrl} alt={alt} loading="lazy" className={`h-full w-full object-cover ${className}`} />
    );
  }

  const h = hash(seed);
  const next = random(h);
  const [sky, skyEnd, building, light] = PALETTES[h % PALETTES.length];
  const id = `c${h.toString(36)}`;

  const floors = 4 + Math.floor(next() * 3);
  const columns = 4 + Math.floor(next() * 3);
  const width = 60 + columns * 26;
  const x = 200 - width / 2;
  const top = 250 - (floors * 34 + 30);
  const sunX = 60 + next() * 280;

  const windows = [];
  for (let row = 0; row < floors; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const lit = next() > 0.45;
      windows.push(
        <rect
          key={`${row}-${col}`}
          x={x + 30 + col * 26}
          y={top + 24 + row * 34}
          width="14"
          height="18"
          rx="2"
          fill={lit ? light : '#ffffff'}
          opacity={lit ? 0.95 : 0.08}
        />,
      );
    }
  }

  return (
    <svg
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={alt}
      className={`h-full w-full ${className}`}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky} />
          <stop offset="1" stopColor={skyEnd} />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill={`url(#${id}-sky)`} />
      <circle cx={sunX} cy="62" r="30" fill={light} opacity="0.85" />
      <circle cx={sunX} cy="62" r="52" fill={light} opacity="0.12" />
      {/* Distant skyline */}
      <path
        d={`M0 200h30v-40h26v22h20v-52h34v70h22v-30h28v30h${x - 160 > 0 ? x - 160 : 0}V260H0Z`}
        fill={building}
        opacity="0.35"
      />
      <path d="M270 260v-88h30v-26h36v44h26v-20h38v90Z" fill={building} opacity="0.35" />
      {/* The building */}
      <rect x={x} y={top} width={width} height={260 - top} rx="6" fill={building} />
      <rect x={x - 6} y={top - 6} width={width + 12} height="10" rx="3" fill={building} />
      {windows}
      <rect x={196 - 14} y="222" width="36" height="38" rx="4" fill={light} opacity="0.9" />
      <rect x="0" y="252" width="400" height="8" fill={building} />
    </svg>
  );
}

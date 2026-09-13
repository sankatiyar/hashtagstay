import Link from 'next/link';

/** The mark: a hash whose top stroke is a roof. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#113d30" />
      <path
        d="M7.5 14.5 16 7.5l8.5 7"
        fill="none"
        stroke="#f2a93b"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <path d="M13 13.5v11M19 13.5v11M9.5 17.5h13M9.5 21.5h13" />
      </g>
    </svg>
  );
}

export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="HashtagStay home">
      <LogoMark className="h-8 w-8 transition-transform duration-300 group-hover:-rotate-6" />
      <span
        className={`font-display text-[1.35rem] leading-none font-semibold tracking-tight ${tone === 'dark' ? 'text-pine-900' : 'text-white'}`}
      >
        <span className="text-marigold-500">#</span>HashtagStay
      </span>
    </Link>
  );
}

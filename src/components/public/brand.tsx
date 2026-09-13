import Link from 'next/link';

/** The mark: a roofline over a rising sun. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#ea580c" />
      <circle cx="16" cy="20" r="5" fill="#ffe4cc" />
      <path
        d="M6.5 15.5 16 7.5l9.5 8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 25.5h20" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <Link
      href="/"
      className="group inline-flex shrink-0 items-center gap-2"
      aria-label="Sandy Stays home"
    >
      <LogoMark className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-6" />
      <span
        className={`hidden text-[1.35rem] leading-none font-extrabold tracking-tight sm:inline ${tone === 'dark' ? 'text-brand-600' : 'text-white'}`}
      >
        sandy stays
      </span>
    </Link>
  );
}

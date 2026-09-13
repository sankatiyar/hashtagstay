import Link from 'next/link';
import type { ReactNode } from 'react';

import { Logo } from '@/components/public/brand';
import { listLiveCities } from '@/lib/services/public-search';

/**
 * Public site shell.
 *
 * A route group, so these pages share a layout without the group name appearing
 * in any URL — `/stays/...` and `/city/...` stay clean, which matters when the
 * URL is itself an SEO surface.
 *
 * The header never reads the session: doing so would make every public page
 * dynamic and cost the static generation the SEO funnel depends on. "Your
 * account" routes through the proxy, which sends signed-out visitors to sign in.
 */
const citySlug = (city: string) =>
  encodeURIComponent(city.toLowerCase().replaceAll(' ', '-'));

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const cities = await listLiveCities();

  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <header className="border-line/70 bg-paper/85 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
            <Link href="/search" className="btn-ghost px-3.5 py-2">
              Browse stays
            </Link>
            {cities.slice(0, 3).map((entry) => (
              <Link
                key={entry.city}
                href={`/city/${citySlug(entry.city)}`}
                className="btn-ghost px-3.5 py-2"
              >
                {entry.city}
              </Link>
            ))}
            <Link href="/search?type=pbsa" className="btn-ghost px-3.5 py-2">
              Student housing
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/host/signup"
              className="text-ink-soft hover:text-ink hidden text-sm font-medium transition xl:inline"
            >
              List your property
            </Link>
            <Link
              href="/account"
              className="btn-secondary hidden px-4 py-2 sm:inline-flex"
            >
              Your account
            </Link>
            <Link
              href="/enquiry"
              className="btn-primary px-3 py-2 text-[13px] sm:px-4 sm:text-sm"
            >
              Find me a stay
            </Link>

            <details className="group relative lg:hidden">
              <summary
                className="btn-ghost cursor-pointer list-none px-2.5 py-2 [&::-webkit-details-marker]:hidden"
                aria-label="Menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </summary>
              <div className="card absolute right-0 mt-2 w-60 p-2 text-sm">
                <Link
                  href="/search"
                  className="hover:bg-sand block rounded-lg px-3 py-2"
                >
                  Browse stays
                </Link>
                {cities.map((entry) => (
                  <Link
                    key={entry.city}
                    href={`/city/${citySlug(entry.city)}`}
                    className="hover:bg-sand block rounded-lg px-3 py-2"
                  >
                    Stays in {entry.city}
                  </Link>
                ))}
                <Link
                  href="/account"
                  className="hover:bg-sand block rounded-lg px-3 py-2"
                >
                  Your account
                </Link>
                <Link
                  href="/host/signup"
                  className="hover:bg-sand block rounded-lg px-3 py-2"
                >
                  List your property
                </Link>
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="bg-pine-950 text-pine-100 mt-24">
        <div className="container-page py-16">
          <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Logo tone="light" />
              <p className="text-pine-200/80 mt-5 max-w-sm text-sm leading-relaxed">
                A marketplace for co-living and student housing. We don’t own or run any
                property — we verify operators, show exactly what we checked, and a
                relationship manager helps you close the right room.
              </p>
              <ul className="text-pine-100 mt-6 space-y-2 text-sm">
                {[
                  'Every claim on a listing states what was checked',
                  'Your number is never shared with an operator',
                  'Pay nothing until the operator confirms your bed',
                ].map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="bg-marigold-400 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <FooterColumn title="Explore">
              <FooterLink href="/search">Browse all stays</FooterLink>
              {cities.map((entry) => (
                <FooterLink key={entry.city} href={`/city/${citySlug(entry.city)}`}>
                  {entry.city}{' '}
                  <span className="text-pine-300/60">({entry.listingCount})</span>
                </FooterLink>
              ))}
              <FooterLink href="/search?type=pbsa">Student housing</FooterLink>
              <FooterLink href="/search?gender=female_only">
                Women-only stays
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Residents">
              <FooterLink href="/enquiry">Get help finding a stay</FooterLink>
              <FooterLink href="/account">Your bookings</FooterLink>
              <FooterLink href="/account/support">Help and safety</FooterLink>
              <FooterLink href="/#how-verification-works">
                How verification works
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Operators">
              <FooterLink href="/host/signup">List your property</FooterLink>
              <FooterLink href="/host/login">Host sign in</FooterLink>
              <FooterLink href="/admin/login">Staff sign in</FooterLink>
            </FooterColumn>
          </div>

          <div className="border-pine-800 text-pine-300/70 mt-14 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p>
              Availability and pricing are as reported by operators and re-confirmed
              before any booking.
            </p>
            <p>© {new Date().getFullYear()} HashtagStay. Made in India.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-marigold-300 text-xs font-semibold tracking-[0.14em] uppercase">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-pine-100/85 transition hover:text-white">
        {children}
      </Link>
    </li>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Logo } from '@/components/public/brand';
import { Icon } from '@/components/public/icons';
import { CompactSearchPill } from '@/components/public/search-pill';
import { listLiveCities } from '@/lib/services/public-search';

/**
 * Public site shell.
 *
 * A route group, so these pages share a layout without the group name appearing
 * in any URL — `/stays/...` and `/city/...` stay clean, which matters when the
 * URL is itself an SEO surface.
 *
 * The header never reads the session: doing so would make every public page
 * dynamic and cost the static generation the SEO funnel depends on. The account
 * button routes through the proxy, which sends signed-out visitors to sign in.
 */
const citySlug = (city: string) =>
  encodeURIComponent(city.toLowerCase().replaceAll(' ', '-'));

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const cities = await listLiveCities();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-line sticky top-0 z-40 border-b bg-white/95 backdrop-blur-md">
        <div className="container-page flex h-20 items-center justify-between gap-4">
          <Logo />

          <div className="hidden md:block">
            <CompactSearchPill />
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/host/signup"
              className="text-ink hover:bg-sand hidden rounded-full px-4 py-2.5 text-sm font-semibold transition lg:inline"
            >
              List your property
            </Link>
            <Link href="/enquiry" className="btn-primary rounded-full px-4 py-2.5">
              Find me a stay
            </Link>

            <details className="group relative">
              <summary
                aria-label="Menu"
                className="border-line flex cursor-pointer list-none items-center gap-2.5 rounded-full border py-1.5 pr-1.5 pl-3 transition hover:shadow-(--shadow-float) [&::-webkit-details-marker]:hidden"
              >
                <Icon name="menu" className="h-4 w-4" strokeWidth={2.4} />
                <span className="bg-ink-soft flex h-8 w-8 items-center justify-center rounded-full text-white">
                  <Icon name="user" className="h-5 w-5" filled strokeWidth={0} />
                </span>
              </summary>
              <div className="border-line absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border bg-white py-2 text-sm shadow-(--shadow-lift)">
                <MenuLink href="/account" strong>
                  Sign in or your account
                </MenuLink>
                <MenuLink href="/enquiry" strong>
                  Get help finding a stay
                </MenuLink>
                <hr className="border-line my-2" />
                <MenuLink href="/search">Browse all stays</MenuLink>
                {cities.map((entry) => (
                  <MenuLink key={entry.city} href={`/city/${citySlug(entry.city)}`}>
                    Stays in {entry.city}
                  </MenuLink>
                ))}
                <hr className="border-line my-2" />
                <MenuLink href="/host/signup">List your property</MenuLink>
                <MenuLink href="/account/support">Help and safety</MenuLink>
              </div>
            </details>
          </div>
        </div>

        <div className="container-page pb-3 md:hidden">
          <Link
            href="/search"
            className="border-line flex items-center gap-3 rounded-full border px-4 py-3 shadow-(--shadow-float)"
          >
            <Icon name="search" className="h-4 w-4" strokeWidth={2.8} />
            <span>
              <span className="text-ink block text-sm font-semibold">Where to?</span>
              <span className="text-ink-soft block text-xs">
                Any city · Any budget · Near campus
              </span>
            </span>
          </Link>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-line bg-sand mt-24 border-t">
        <div className="container-page py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <FooterColumn title="Support">
              <FooterLink href="/account/support">Help and safety</FooterLink>
              <FooterLink href="/enquiry">Get help finding a stay</FooterLink>
              <FooterLink href="/account">Your bookings</FooterLink>
              <FooterLink href="/#how-verification-works">
                How verification works
              </FooterLink>
            </FooterColumn>
            <FooterColumn title="Explore">
              <FooterLink href="/search">Browse all stays</FooterLink>
              {cities.map((entry) => (
                <FooterLink key={entry.city} href={`/city/${citySlug(entry.city)}`}>
                  Stays in {entry.city}
                </FooterLink>
              ))}
              <FooterLink href="/search?type=pbsa">Student housing</FooterLink>
              <FooterLink href="/search?gender=female_only">
                Women-only stays
              </FooterLink>
            </FooterColumn>
            <FooterColumn title="Operators">
              <FooterLink href="/host/signup">List your property</FooterLink>
              <FooterLink href="/host/login">Host sign in</FooterLink>
              <FooterLink href="/admin/login">Staff sign in</FooterLink>
            </FooterColumn>
            <div>
              <p className="text-ink text-sm font-bold">Our promise</p>
              <ul className="text-ink mt-4 space-y-3 text-sm">
                {[
                  'Every listing says exactly what we checked',
                  'Your number is never shared with an operator',
                  'Pay nothing until your bed is confirmed',
                ].map((point) => (
                  <li key={point} className="flex gap-2.5">
                    <Icon
                      name="check"
                      className="text-brand-600 mt-0.5 h-4 w-4 shrink-0"
                      strokeWidth={3}
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-brand-200/60 text-ink mt-12 flex flex-col gap-3 border-t pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Sandy Stays · Made in India</p>
            <p className="text-ink-soft">
              Availability and prices are as reported by operators and re-confirmed
              before any booking.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MenuLink({
  href,
  strong = false,
  children,
}: {
  href: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`hover:bg-sand block px-4 py-2.5 transition ${strong ? 'text-ink font-semibold' : 'text-ink'}`}
    >
      {children}
    </Link>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-ink text-sm font-bold">{title}</p>
      <ul className="mt-4 space-y-3 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-ink transition hover:underline">
        {children}
      </Link>
    </li>
  );
}

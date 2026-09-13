import Link from 'next/link';
import type { ReactNode } from 'react';

import { LogoMark } from '@/components/public/brand';
import { hostMemberships } from '@/lib/auth/host';
import { getCurrentUser } from '@/lib/auth/session';

import { hostSignOut } from './actions';

export const metadata = {
  title: 'Host portal · Sandy Stays',
  robots: { index: false, follow: false },
};

const NAV = [
  { href: '/host', label: 'Dashboard' },
  { href: '/host/properties', label: 'Properties' },
  { href: '/host/bookings', label: 'Bookings' },
  { href: '/host/statements', label: 'Statements' },
];

export default async function HostLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.audience !== 'host') return <>{children}</>;
  const memberships = await hostMemberships(user.id);

  return (
    <div className="bg-paper min-h-screen">
      <header className="border-line sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/host" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-ink text-lg font-semibold tracking-tight">
              Sandy Stays
            </span>
            <span className="bg-peach-100 text-peach-700 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase">
              Host
            </span>
          </Link>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-ink-soft hover:bg-brand-50 hover:text-brand-800 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <p className="hidden text-right text-sm md:block">
              <span className="text-ink block font-semibold">
                {user.fullName ?? user.email}
              </span>
              <span className="text-ink-soft block text-xs">
                {memberships[0]?.organizationName}
              </span>
            </p>
            <form action={hostSignOut}>
              <button type="submit" className="btn-secondary px-4 py-2">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';

import { hostMemberships } from '@/lib/auth/host';
import { getCurrentUser } from '@/lib/auth/session';

import { hostSignOut } from './actions';

export const metadata = {
  title: 'Host portal · HashtagStay',
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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/host" className="font-semibold tracking-tight text-slate-900">
            #HashtagStay
            <span className="ml-2 text-xs font-normal text-slate-400">host</span>
          </Link>
          <nav className="flex gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-slate-600 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <p className="text-right text-sm">
              <span className="block font-medium text-slate-900">
                {user.fullName ?? user.email}
              </span>
              <span className="block text-xs text-slate-500">
                {memberships[0]?.organizationName}
              </span>
            </p>
            <form action={hostSignOut}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

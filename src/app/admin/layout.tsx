import Link from 'next/link';
import type { ReactNode } from 'react';

import { getCurrentUser } from '@/lib/auth/session';

import { SignOutButton } from './sign-out-button';

export const metadata = {
  title: 'Ops console · #HashtagStay',
  robots: { index: false, follow: false },
};

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/properties', label: 'Inventory' },
  { href: '/admin/verification', label: 'Verification' },
  { href: '/admin/stale', label: 'Needs confirming' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Layouts render for the login page too, so this must tolerate no user
  // rather than redirecting — the page-level guards handle authorization.
  const user = await getCurrentUser();

  if (!user || user.audience !== 'staff') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold tracking-tight text-slate-900">
              #HashtagStay
              <span className="ml-2 text-xs font-normal text-slate-400">ops</span>
            </Link>
            <nav className="hidden gap-1 sm:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">
                {user.fullName ?? user.email}
              </p>
              <p className="text-xs text-slate-500">
                {user.roles.length > 0 ? user.roles.join(', ') : 'no roles assigned'}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden">
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
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

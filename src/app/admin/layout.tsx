import Link from 'next/link';
import type { ReactNode } from 'react';

import { LogoMark } from '@/components/public/brand';
import { type Permission, can } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';

import { SignOutButton } from './sign-out-button';

export const metadata = {
  title: 'Ops console · Sandy Stays',
  robots: { index: false, follow: false },
};

/** Nav entries shown only to roles that can use them. */
const NAV: { href: string; label: string; any: Permission[] }[] = [
  { href: '/admin', label: 'Overview', any: [] },
  {
    href: '/admin/leads',
    label: 'Leads',
    any: ['lead:view_assigned', 'lead:view_all'],
  },
  {
    href: '/admin/bookings',
    label: 'Bookings',
    any: ['booking:create', 'payment:view', 'lead:view_all'],
  },
  { href: '/admin/properties', label: 'Inventory', any: ['property:view'] },
  { href: '/admin/verification', label: 'Verification', any: ['property:view'] },
  { href: '/admin/stale', label: 'Needs confirming', any: ['availability:edit'] },
  { href: '/admin/photos', label: 'Photos', any: ['media:moderate'] },
  { href: '/admin/tickets', label: 'Support', any: ['ticket:view'] },
  { href: '/admin/reviews', label: 'Reviews', any: ['review:moderate'] },
  { href: '/admin/reports', label: 'Reports', any: ['report:view'] },
  {
    href: '/admin/fees',
    label: 'Fees & statements',
    any: ['fee_rule:view', 'statement:generate'],
  },
  { href: '/admin/outbox', label: 'Outbox', any: ['report:view'] },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Layouts render for the login page too, so this tolerates no user; the
  // page-level guards do the authorization.
  const user = await getCurrentUser();
  if (!user || user.audience !== 'staff') return <>{children}</>;

  const items = NAV.filter(
    (item) => item.any.length === 0 || item.any.some((p) => can(user.roles, p)),
  );
  const initials = (user.fullName ?? user.email ?? '?')
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-line sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2.5 whitespace-nowrap">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-ink text-lg font-semibold tracking-tight">
              Sandy Stays
            </span>
            <span className="bg-brand-50 text-brand-700 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase">
              Ops
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/profile"
              className="hover:bg-sand flex items-center gap-3 rounded-full py-1 pr-1 pl-3 transition"
            >
              <span className="hidden text-right sm:block">
                <span className="text-ink block text-sm font-semibold">
                  {user.fullName ?? user.email}
                </span>
                <span className="text-ink-soft block text-xs">
                  {user.roles.length > 0
                    ? user.roles.join(', ').replaceAll('_', ' ')
                    : 'no roles assigned'}
                </span>
              </span>
              <span className="bg-brand-600 text-peach-100 flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold">
                {initials}
              </span>
            </Link>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-ink-soft hover:bg-brand-50 hover:text-brand-800 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}

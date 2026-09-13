import Link from 'next/link';
import type { ReactNode } from 'react';

import { type Permission, can } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';

import { SignOutButton } from './sign-out-button';

export const metadata = {
  title: 'Ops console · #HashtagStay',
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/admin"
            className="font-semibold tracking-tight whitespace-nowrap text-slate-900"
          >
            #HashtagStay
            <span className="ml-2 text-xs font-normal text-slate-400">ops</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin/profile" className="text-right">
              <p className="text-sm font-medium text-slate-900">
                {user.fullName ?? user.email}
              </p>
              <p className="text-xs text-slate-500">
                {user.roles.length > 0 ? user.roles.join(', ') : 'no roles assigned'}
              </p>
            </Link>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
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

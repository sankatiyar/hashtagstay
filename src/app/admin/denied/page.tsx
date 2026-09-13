import Link from 'next/link';

import { getCurrentUser } from '@/lib/auth/session';

export const metadata = {
  title: 'Not permitted · Sandy Stays ops',
  robots: { index: false, follow: false },
};

export default async function DeniedPage() {
  const user = await getCurrentUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          You do not have access to that screen
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Your account holds{' '}
          {user?.roles.length
            ? `the role${user.roles.length > 1 ? 's' : ''} ${user.roles.join(', ')}`
            : 'no roles'}
          , which does not include the permission this page requires. The attempt has
          been recorded in the audit log.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          If you need it, ask a super admin to grant the role rather than sharing
          another person&apos;s login.
        </p>
        <Link
          href="/admin"
          className="mt-5 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Back to overview
        </Link>
      </div>
    </main>
  );
}

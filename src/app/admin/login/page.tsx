import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/session';

import { LoginForm } from './login-form';

export const metadata = {
  title: 'Sign in · Sandy Stays ops',
  // The console must never be indexed.
  robots: { index: false, follow: false },
};

export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  // searchParams is a Promise in Next 16 — synchronous access was removed.
  const { next } = await props.searchParams;

  const user = await getCurrentUser();
  if (user?.audience === 'staff') {
    redirect(next && next.startsWith('/') ? next : '/admin');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-semibold tracking-tight text-slate-900">
            Sandy Stays
          </p>
          <p className="mt-1 text-sm text-slate-500">Operations console</p>
        </div>

        <LoginForm next={next ?? '/admin'} />

        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Development logins</p>
            <p className="mt-1">
              <code>ops@hashtagstay.local</code>,{' '}
              <code>verifier@hashtagstay.local</code>,{' '}
              <code>admin@hashtagstay.local</code>
            </p>
            <p className="mt-1">
              Password <code>devpassword123</code> — seeded by{' '}
              <code>npm run db:seed</code>, never created in production.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

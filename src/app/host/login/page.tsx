import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/session';

import { HostLoginForm } from '../auth-forms';

export const metadata = {
  title: 'Host sign in · HashtagStay',
  robots: { index: false, follow: false },
};

export default async function HostLoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await props.searchParams;
  const user = await getCurrentUser();
  if (user?.audience === 'host') redirect('/host');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <p className="text-center text-2xl font-semibold tracking-tight text-slate-900">
          #HashtagStay
        </p>
        <p className="mt-1 mb-6 text-center text-sm text-slate-500">
          Host and operator portal
        </p>
        <HostLoginForm next={next ?? '/host'} />
        <p className="mt-4 text-center text-sm text-slate-600">
          New to HashtagStay?{' '}
          <Link href="/host/signup" className="underline">
            List your property
          </Link>
        </p>
      </div>
    </main>
  );
}

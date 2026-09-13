import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentResident } from '@/lib/auth/resident';

import { ResidentLoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in · HashtagStay',
  robots: { index: false, follow: false },
};

export default async function ResidentLoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await props.searchParams;
  if (await getCurrentResident()) redirect(next?.startsWith('/') ? next : '/account');

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Use the mobile number you enquired with. We will text you a code — there is no
        password.
      </p>
      <div className="mt-6">
        <ResidentLoginForm next={next ?? '/account'} />
      </div>
    </main>
  );
}

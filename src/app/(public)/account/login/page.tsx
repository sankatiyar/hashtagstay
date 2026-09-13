import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LogoMark } from '@/components/public/brand';
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
    <main className="container-page flex justify-center py-16">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <LogoMark className="h-11 w-11" />
          <h1 className="font-display text-pine-950 mt-6 text-3xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="text-ink-soft mt-2">
            Use the mobile number you enquired with. We’ll text you a code — there’s no
            password to remember.
          </p>
          <div className="mt-7">
            <ResidentLoginForm next={next ?? '/account'} />
          </div>
        </div>
        <p className="text-ink-soft mt-5 text-center text-sm">
          Your enquiries, bookings, saved stays and support requests all live here.
        </p>
      </div>
    </main>
  );
}

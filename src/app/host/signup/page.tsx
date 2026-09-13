import Link from 'next/link';

import { HostSignupForm } from '../auth-forms';

export const metadata = {
  title: 'List your property · HashtagStay',
  description:
    'List co-living, student housing or rooms on HashtagStay free. We verify, bring verified residents, and charge commission only on bookings.',
};

export default function HostSignupPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="text-2xl font-semibold tracking-tight text-slate-900">
          List your property on HashtagStay
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li>• Free to list. Commission only on bookings we bring.</li>
          <li>
            • Our relationship managers pre-qualify residents and confirm with you
            before anyone is charged.
          </li>
          <li>• Your phone number is never shown to residents.</li>
        </ul>
        <div className="mt-6">
          <HostSignupForm />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/host/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

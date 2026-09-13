import Link from 'next/link';
import type { ReactNode } from 'react';

import { listLiveCities } from '@/lib/services/public-search';

/**
 * Public site shell.
 *
 * A route group, so these pages share a layout without the group name appearing
 * in any URL — `/stays/...` and `/city/...` stay clean, which matters when the
 * URL is itself an SEO surface.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const cities = await listLiveCities();

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-slate-900"
          >
            #HashtagStay
            <span className="ml-2 hidden text-xs font-normal text-slate-500 sm:inline">
              Budget friendly, secure stay
            </span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/search"
              className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Browse stays
            </Link>
            {cities.slice(0, 3).map((entry) => (
              <Link
                key={entry.city}
                href={`/city/${encodeURIComponent(entry.city.toLowerCase().replaceAll(' ', '-'))}`}
                className="hidden rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block"
              >
                {entry.city}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {children}

      <footer className="mt-16 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="font-semibold text-slate-900">#HashtagStay</p>
              <p className="mt-2 leading-relaxed">
                An aggregator for co-living and student housing. We do not own or
                operate any property — we connect residents with verified operators and
                help close the booking over the phone.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">Cities</p>
              <ul className="mt-2 space-y-1">
                {cities.map((entry) => (
                  <li key={entry.city}>
                    <Link
                      href={`/city/${encodeURIComponent(entry.city.toLowerCase().replaceAll(' ', '-'))}`}
                      className="hover:text-slate-900 hover:underline"
                    >
                      {entry.city}{' '}
                      <span className="text-slate-400">({entry.listingCount})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-900">How verification works</p>
              <p className="mt-2 leading-relaxed">
                Every listing shows exactly which checks we completed and when. We never
                show a bare &ldquo;verified&rdquo; badge, because what was actually
                checked is the part that matters.
              </p>
            </div>
          </div>

          <p className="mt-8 border-t border-slate-200 pt-6 text-xs text-slate-500">
            Availability and pricing are as reported by the operator and confirmed
            before booking. © {new Date().getFullYear()} HashtagStay.
          </p>
        </div>
      </footer>
    </div>
  );
}

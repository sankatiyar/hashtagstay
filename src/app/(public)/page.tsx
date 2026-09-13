import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { HeroSearch } from '@/components/public/hero-search';
import { ListingCard } from '@/components/public/listing-card';
import { ListingCover } from '@/components/public/listing-cover';
import { format, money } from '@/lib/money';
import { absoluteUrl, jsonLdScript, organizationJsonLd, pageTitle } from '@/lib/seo';
import {
  type SearchResultRow,
  homeStats,
  listLiveCities,
  listPublishedInstitutions,
  searchListings,
} from '@/lib/services/public-search';
import { TIER_LABELS, TIER_RESIDENT_FACING } from '@/lib/verification/rubric';

export const revalidate = 900;

export const metadata: Metadata = {
  title: pageTitle('Verified co-living and student housing in India'),
  description:
    'Find verified co-living, student housing and home-sharing across India. Search by campus, budget and room type — then a relationship manager helps you close it over the phone.',
  alternates: { canonical: absoluteUrl('/') },
};

const TIERS = ['documents_checked', 'photos_verified', 'onground_audited'] as const;

export default async function HomePage() {
  const [{ rows }, cities, campuses, stats] = await Promise.all([
    searchListings({ pageSize: 6 }),
    listLiveCities(),
    listPublishedInstitutions(),
    homeStats(),
  ]);

  // Group campuses by city so the links read as a place, not a flat list.
  const byCity = new Map<string, typeof campuses>();
  for (const campus of campuses) {
    const list = byCity.get(campus.city) ?? [];
    list.push(campus);
    byCity.set(campus.city, list);
  }

  const needs = [
    {
      href: '/search?gender=female_only',
      title: 'Women-only stays',
      body: 'Properties that house women only, with their safety provisions listed up front.',
      count: stats.womenOnly,
      icon: <IconShield />,
    },
    {
      href: '/search?type=pbsa',
      title: 'Student housing',
      body: 'Purpose-built residences, searchable by walking distance to your campus.',
      count: stats.byType.pbsa ?? 0,
      icon: <IconCap />,
    },
    {
      href: '/search?type=coliving',
      title: 'Co-living',
      body: 'Furnished rooms with Wi-Fi, housekeeping and a community, for working professionals.',
      count: stats.byType.coliving ?? 0,
      icon: <IconSofa />,
    },
    {
      href: '/search?occupancy=1',
      title: 'Private rooms',
      body: 'A room of your own, no sharing — filtered for you across every city.',
      count: null,
      icon: <IconKey />,
    },
  ];

  return (
    <main>
      <script {...jsonLdScript(organizationJsonLd())} />

      {/* ---- Hero ---------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55rem_32rem_at_90%_-10%,var(--color-marigold-100),transparent_60%),radial-gradient(45rem_30rem_at_-10%_0%,var(--color-pine-100),transparent_55%)]"
        />
        <div className="container-page relative grid gap-12 pt-12 pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-20 lg:pb-24">
          <div className="animate-rise">
            <p className="eyebrow">Co-living · Student housing · Home sharing</p>
            <h1 className="font-display text-pine-950 mt-4 text-[2.6rem] leading-[1.04] font-semibold tracking-tight sm:text-6xl">
              A room you can trust, in a city that’s{' '}
              <span className="text-pine-600 italic">new to you.</span>
            </h1>
            <p className="text-ink-soft mt-6 max-w-xl text-lg leading-relaxed">
              Every listing tells you exactly what we checked. When you find one you
              like, a relationship manager re-confirms the bed with the operator — and
              you pay nothing until they do.
            </p>

            <div className="mt-9">
              <HeroSearch cities={cities} campuses={campuses} />
            </div>

            <ul className="text-ink-soft mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {['Free to enquire', 'Your number stays private', 'No brokerage'].map(
                (point) => (
                  <li key={point} className="flex items-center gap-2">
                    <IconCheck className="text-pine-500 h-4 w-4" />
                    {point}
                  </li>
                ),
              )}
            </ul>
          </div>

          <HeroCollage listings={rows.slice(0, 3)} />
        </div>
      </section>

      {/* ---- Numbers, all counted from live inventory ------------------------ */}
      <section className="border-line border-y bg-white">
        <dl className="container-page grid grid-cols-2 gap-x-6 gap-y-8 py-10 lg:grid-cols-4">
          <Stat value={String(stats.liveListings)} label="verified stays live now" />
          <Stat
            value={String(stats.cities)}
            label={stats.cities === 1 ? 'city covered' : 'cities covered'}
          />
          <Stat value={String(stats.campuses)} label="campuses mapped for distance" />
          <Stat
            value={
              stats.fromRentMinor !== null
                ? format(money(stats.fromRentMinor, 'INR'))
                : '—'
            }
            label="lowest rent per month"
          />
        </dl>
      </section>

      {/* ---- Browse by need --------------------------------------------------- */}
      <section className="container-page py-20">
        <SectionHeading
          eyebrow="Start with what matters"
          title="Find the kind of stay you need"
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {needs.map((need) => (
            <Link
              key={need.title}
              href={need.href}
              className="group card hover:border-pine-200 relative flex flex-col p-6 transition duration-300 hover:-translate-y-1 hover:shadow-(--shadow-lift)"
            >
              <span className="bg-pine-50 text-pine-700 group-hover:bg-pine-800 group-hover:text-marigold-300 flex h-11 w-11 items-center justify-center rounded-xl transition">
                {need.icon}
              </span>
              <h3 className="font-display text-ink mt-5 text-xl font-semibold">
                {need.title}
              </h3>
              <p className="text-ink-soft mt-2 flex-1 text-sm leading-relaxed">
                {need.body}
              </p>
              <p className="text-pine-700 mt-5 flex items-center justify-between text-sm font-semibold">
                {need.count !== null ? `${need.count} live` : 'Browse'}
                <IconArrow className="h-4 w-4 transition group-hover:translate-x-1" />
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- Listings --------------------------------------------------------- */}
      {rows.length > 0 && (
        <section className="bg-sand/60 py-20">
          <div className="container-page">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                eyebrow="Handpicked from verified operators"
                title="Stays residents are enquiring about"
              />
              <Link href="/search" className="btn-secondary">
                Browse all stays <IconArrow className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((listing) => (
                <ListingCard key={listing.id} listing={listing} showDistance={false} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- How it works ----------------------------------------------------- */}
      <section className="container-page py-20">
        <div className="bg-pine-900 overflow-hidden rounded-[2rem] text-white">
          <div className="grid gap-12 p-8 sm:p-12 lg:grid-cols-[0.8fr_1.2fr] lg:p-16">
            <div>
              <p className="text-marigold-300 text-xs font-semibold tracking-[0.14em] uppercase">
                How it works
              </p>
              <h2 className="font-display mt-3 text-4xl leading-tight font-semibold">
                Search online. <br />
                Close it with a person.
              </h2>
              <p className="text-pine-100/80 mt-5 max-w-sm leading-relaxed">
                Listings get you a shortlist. A relationship manager gets you a room
                that’s actually free, at the price you were quoted.
              </p>
              <Link href="/enquiry" className="btn-accent mt-8">
                Talk to a relationship manager
              </Link>
            </div>

            <ol className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                {
                  title: 'Search and shortlist',
                  body: 'Filter by campus distance, budget, room sharing and the safety provisions that matter to you.',
                },
                {
                  title: 'We confirm, then advise',
                  body: 'Your relationship manager re-checks availability and price with the operator, then walks you through two or three genuine options.',
                },
                {
                  title: 'Pay only once your bed is confirmed',
                  body: 'The operator confirms first. Then you pay a small booking fee to us with a GST invoice — rent and deposit go to the operator.',
                },
              ].map((step, index) => (
                <li
                  key={step.title}
                  className="flex gap-5 rounded-2xl bg-white/[0.06] p-6 ring-1 ring-white/10"
                >
                  <span className="font-display text-marigold-300 text-4xl leading-none font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="text-pine-100/75 mt-1.5 text-sm leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---- Verification ----------------------------------------------------- */}
      <section
        id="how-verification-works"
        className="container-page scroll-mt-24 py-12"
      >
        <SectionHeading
          eyebrow="No bare “verified” badges"
          title="You always see what we actually checked"
          body="“Verified” means nothing without the detail. Every listing carries one of three tiers, with the date it was done and when it expires."
          center
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TIERS.map((tier, index) => (
            <div key={tier} className="card relative overflow-hidden p-7">
              <div className="flex items-center gap-1.5">
                {TIERS.map((_, dot) => (
                  <span
                    key={dot}
                    className={`h-1.5 w-8 rounded-full ${dot <= index ? 'bg-pine-500' : 'bg-line'}`}
                  />
                ))}
              </div>
              <h3 className="font-display text-ink mt-6 text-2xl font-semibold">
                {TIER_LABELS[tier]}
              </h3>
              <p className="text-ink-soft mt-3 text-sm leading-relaxed">
                {TIER_RESIDENT_FACING[tier]}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Campuses --------------------------------------------------------- */}
      {byCity.size > 0 && (
        <section className="container-page py-20">
          <SectionHeading eyebrow="For students" title="Stays near your campus" />
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[...byCity.entries()].map(([city, list]) => (
              <div key={city}>
                <p className="font-display text-ink text-xl font-semibold">{city}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {list.map((campus) => (
                    <li key={campus.slug}>
                      <Link href={`/near/${campus.slug}`} className="chip">
                        {campus.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Two calls to action --------------------------------------------- */}
      <section className="container-page grid gap-6 pb-4 lg:grid-cols-2">
        <div className="bg-marigold-100 relative overflow-hidden rounded-[2rem] p-8 sm:p-12">
          <p className="eyebrow text-marigold-700">Not sure where to start?</p>
          <h2 className="font-display text-pine-950 mt-3 max-w-md text-3xl leading-tight font-semibold">
            Tell us your city, budget and move-in date.
          </h2>
          <p className="text-pine-900/75 mt-4 max-w-md leading-relaxed">
            A relationship manager will call you with options that are genuinely
            available. It’s free.
          </p>
          <Link href="/enquiry" className="btn-primary mt-8">
            Find me a stay
          </Link>
        </div>
        <div className="border-line relative overflow-hidden rounded-[2rem] border bg-white p-8 sm:p-12">
          <p className="eyebrow">For operators</p>
          <h2 className="font-display text-pine-950 mt-3 max-w-md text-3xl leading-tight font-semibold">
            Run a co-living, PG or student residence?
          </h2>
          <p className="text-ink-soft mt-4 max-w-md leading-relaxed">
            List free. We verify you, send pre-qualified residents, and charge
            commission only on bookings we bring.
          </p>
          <Link href="/host/signup" className="btn-secondary mt-8">
            List your property <IconArrow className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

function HeroCollage({ listings }: { listings: SearchResultRow[] }) {
  const tiles = [0, 1, 2].map((index) => listings[index] ?? null);
  const place = (listing: SearchResultRow | null) =>
    listing ? [listing.locality, listing.city].filter(Boolean).join(', ') : '';

  return (
    <div className="relative hidden lg:block" aria-hidden="true">
      <div className="grid h-[540px] grid-cols-5 grid-rows-6 gap-4">
        {tiles.map((listing, index) => (
          <div
            key={index}
            className={`relative overflow-hidden rounded-3xl shadow-(--shadow-lift) ${index === 0 ? 'col-span-3 row-span-6' : 'col-span-2 row-span-3'}`}
          >
            <ListingCover seed={listing?.slug ?? `hero-${index}`} alt="" />
            {listing && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 text-white">
                <p className="text-sm leading-tight font-semibold">{listing.name}</p>
                <p className="text-xs text-white/75">{place(listing)}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card animate-rise absolute bottom-16 -left-10 w-64 p-5 [animation-delay:250ms]">
        <p className="text-ink-soft text-xs font-semibold tracking-wide uppercase">
          What we checked
        </p>
        <ul className="text-ink mt-3 space-y-2 text-sm">
          {['Ownership or lease', 'Photos match the property', 'Visited in person'].map(
            (item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="bg-pine-100 text-pine-700 flex h-5 w-5 items-center justify-center rounded-full">
                  <IconCheck className="h-3 w-3" />
                </span>
                {item}
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="card animate-rise absolute top-10 -right-6 w-60 p-5 [animation-delay:450ms]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="bg-pine-400 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
            <span className="bg-pine-500 relative inline-flex h-2.5 w-2.5 rounded-full" />
          </span>
          <p className="text-pine-700 text-xs font-semibold">
            Bed confirmed by operator
          </p>
        </div>
        <p className="text-ink mt-2 text-sm leading-snug">
          You pay nothing until this happens.
        </p>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-display text-pine-950 mt-3 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {body && <p className="text-ink-soft mt-4 text-lg leading-relaxed">{body}</p>}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-ink-soft mt-1 text-sm">{label}</dt>
      <dd className="font-display text-pine-900 text-4xl font-semibold tracking-tight">
        {value}
      </dd>
    </div>
  );
}

function Svg({
  className = 'h-5 w-5',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

function IconShield() {
  return (
    <Svg>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

function IconCap() {
  return (
    <Svg>
      <path d="M2.5 9.5 12 5l9.5 4.5L12 14Z" />
      <path d="M6.5 11.5V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.5M21.5 9.5V15" />
    </Svg>
  );
}

function IconSofa() {
  return (
    <Svg>
      <path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
      <path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3Z" />
      <path d="M6 18v2M18 18v2" />
    </Svg>
  );
}

function IconKey() {
  return (
    <Svg>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9M16 7l3 3M14 9l2 2" />
    </Svg>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { CategoryBar } from '@/components/public/category-bar';
import { Icon, type IconName } from '@/components/public/icons';
import { ListingCard } from '@/components/public/listing-card';
import { Photo } from '@/components/public/photo';
import { SearchPill } from '@/components/public/search-pill';
import { format, money } from '@/lib/money';
import { CITY_PHOTOS, type PhotoKey } from '@/lib/photos';
import { absoluteUrl, jsonLdScript, organizationJsonLd, pageTitle } from '@/lib/seo';
import {
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
const citySlug = (city: string) => city.toLowerCase().replaceAll(' ', '-');

export default async function HomePage() {
  const [{ rows }, cities, campuses, stats] = await Promise.all([
    searchListings({ pageSize: 8 }),
    listLiveCities(),
    listPublishedInstitutions(),
    homeStats(),
  ]);

  const byCity = new Map<string, typeof campuses>();
  for (const campus of campuses) {
    const list = byCity.get(campus.city) ?? [];
    list.push(campus);
    byCity.set(campus.city, list);
  }

  const kinds: {
    href: string;
    title: string;
    body: string;
    photo: PhotoKey;
    count: number | null;
  }[] = [
    {
      href: '/search?gender=female_only',
      title: 'Women-only stays',
      body: 'Safety provisions listed up front',
      photo: 'womenTalking',
      count: stats.womenOnly,
    },
    {
      href: '/search?type=pbsa',
      title: 'Student housing',
      body: 'Searchable by distance to campus',
      photo: 'studentsLaptop',
      count: stats.byType.pbsa ?? 0,
    },
    {
      href: '/search?type=coliving',
      title: 'Co-living',
      body: 'Furnished rooms and a community',
      photo: 'heroFriends',
      count: stats.byType.coliving ?? 0,
    },
    {
      href: '/search?occupancy=1',
      title: 'Private rooms',
      body: 'A room of your own, no sharing',
      photo: 'sunlitBedroom',
      count: null,
    },
  ];

  return (
    <main>
      <script {...jsonLdScript(organizationJsonLd())} />

      {/* ---- Hero ---------------------------------------------------------- */}
      <section className="container-page pt-6">
        <div className="relative overflow-hidden rounded-[2rem]">
          <div className="absolute inset-0">
            <Photo
              name="rooftopFriends"
              aspect={16 / 7}
              sizes="100vw"
              priority
              alt=""
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
          </div>
          <div className="relative flex min-h-[560px] flex-col justify-end p-6 sm:p-10 lg:min-h-[600px] lg:p-14">
            <p className="text-brand-700 w-fit rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold">
              Co-living · Student housing · Home sharing
            </p>
            <h1 className="mt-5 max-w-2xl text-4xl leading-[1.05] font-extrabold tracking-tight text-white sm:text-6xl">
              Find a room you can trust, in a city that’s new to you
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/90">
              Every listing says exactly what we checked. A relationship manager
              re-confirms your bed — and you pay nothing until they do.
            </p>
            <div className="mt-8 max-w-4xl">
              <SearchPill cities={cities} campuses={campuses} />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Categories ------------------------------------------------------ */}
      <section className="container-page border-line mt-8 border-b">
        <CategoryBar cities={cities} />
      </section>

      {/* ---- Listings --------------------------------------------------------- */}
      {rows.length > 0 && (
        <section className="container-page pt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-ink text-2xl font-bold tracking-tight">
                Stays residents are enquiring about
              </h2>
              <p className="text-ink-soft mt-1">
                {stats.liveListings} verified stays in {stats.cities}{' '}
                {stats.cities === 1 ? 'city' : 'cities'}
                {stats.fromRentMinor !== null &&
                  ` · from ${format(money(stats.fromRentMinor, 'INR'))} a month`}
              </p>
            </div>
            <Link
              href="/search"
              className="text-ink hidden text-sm font-semibold underline sm:block"
            >
              Show all
            </Link>
          </div>
          <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((listing) => (
              <ListingCard key={listing.id} listing={listing} showDistance={false} />
            ))}
          </div>
        </section>
      )}

      {/* ---- Cities ----------------------------------------------------------- */}
      {cities.length > 0 && (
        <section className="container-page pt-20">
          <h2 className="text-ink text-2xl font-bold tracking-tight">
            Explore by city
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((entry) => (
              <Link
                key={entry.city}
                href={`/city/${citySlug(entry.city)}`}
                className="group relative block aspect-[4/3] overflow-hidden rounded-2xl"
              >
                {CITY_PHOTOS[entry.city] ? (
                  <Photo
                    name={CITY_PHOTOS[entry.city]}
                    aspect={4 / 3}
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="transition duration-500 group-hover:scale-105"
                    alt=""
                  />
                ) : (
                  <div className="bg-brand-500 h-full w-full" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-0 p-5 text-white">
                  <p className="text-2xl font-bold">{entry.city}</p>
                  <p className="text-sm text-white/85">
                    {entry.listingCount} verified{' '}
                    {entry.listingCount === 1 ? 'stay' : 'stays'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Kinds of stay ---------------------------------------------------- */}
      <section className="container-page pt-20">
        <h2 className="text-ink text-2xl font-bold tracking-tight">
          Find the kind of stay you need
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {kinds.map((kind) => (
            <Link key={kind.title} href={kind.href} className="group block">
              <div className="aspect-[4/5] overflow-hidden rounded-2xl">
                <Photo
                  name={kind.photo}
                  aspect={4 / 5}
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="transition duration-500 group-hover:scale-105"
                  alt=""
                />
              </div>
              <p className="text-ink mt-3 font-semibold">{kind.title}</p>
              <p className="text-ink-soft text-sm">
                {kind.body}
                {kind.count !== null && ` · ${kind.count} live`}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- How it works ----------------------------------------------------- */}
      <section className="container-page pt-20">
        <div className="bg-sand grid overflow-hidden rounded-[2rem] lg:grid-cols-2">
          <div className="p-8 sm:p-12 lg:p-16">
            <p className="eyebrow">How Sandy Stays works</p>
            <h2 className="text-ink mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Search online. Close it with a person.
            </h2>
            <ol className="mt-8 space-y-6">
              {(
                [
                  [
                    'search',
                    'Search and shortlist',
                    'Filter by campus distance, budget, room sharing and safety provisions.',
                  ],
                  [
                    'phone',
                    'We confirm, then advise',
                    'Your relationship manager re-checks the bed and price with the operator and calls you with genuine options.',
                  ],
                  [
                    'lock',
                    'Pay only once it’s confirmed',
                    'The operator confirms first. Then a small booking fee, with a GST invoice. Rent goes to the operator.',
                  ],
                ] as [IconName, string, string][]
              ).map(([icon, title, body]) => (
                <li key={title} className="flex gap-4">
                  <span className="bg-brand-600 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white">
                    <Icon name={icon} className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-ink font-bold">{title}</p>
                    <p className="text-ink-soft mt-1">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/enquiry" className="btn-primary mt-10 px-6 py-3.5">
              Talk to a relationship manager
            </Link>
          </div>
          <div className="relative min-h-[320px]">
            <div className="absolute inset-0">
              <Photo
                name="phoneSupport"
                aspect={1}
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Verification ----------------------------------------------------- */}
      <section
        id="how-verification-works"
        className="container-page scroll-mt-28 pt-20"
      >
        <div className="max-w-2xl">
          <h2 className="text-ink text-2xl font-bold tracking-tight">
            No bare “verified” badges
          </h2>
          <p className="text-ink-soft mt-2">
            Every listing carries one of three tiers, with when it was checked and when
            it expires.
          </p>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier, index) => (
            <div key={tier} className="border-line rounded-2xl border p-6">
              <div className="flex items-center gap-1.5">
                {TIERS.map((_, dot) => (
                  <span
                    key={dot}
                    className={`h-1.5 w-8 rounded-full ${dot <= index ? 'bg-brand-600' : 'bg-line'}`}
                  />
                ))}
              </div>
              <h3 className="text-ink mt-5 text-lg font-bold">{TIER_LABELS[tier]}</h3>
              <p className="text-ink-soft mt-2 text-sm leading-relaxed">
                {TIER_RESIDENT_FACING[tier]}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Campuses --------------------------------------------------------- */}
      {byCity.size > 0 && (
        <section className="container-page pt-20">
          <h2 className="text-ink text-2xl font-bold tracking-tight">
            Stays near your campus
          </h2>
          <div className="mt-6 grid gap-8 md:grid-cols-3">
            {[...byCity.entries()].map(([city, list]) => (
              <div key={city}>
                <p className="text-ink font-semibold">{city}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
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

      {/* ---- Operators -------------------------------------------------------- */}
      <section className="container-page pt-20">
        <div className="bg-brand-600 relative overflow-hidden rounded-[2rem]">
          <div className="grid lg:grid-cols-2">
            <div className="p-8 text-white sm:p-12 lg:p-16">
              <p className="text-peach-200 text-xs font-bold tracking-[0.12em] uppercase">
                For operators
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Run a co-living, PG or student residence?
              </h2>
              <p className="mt-4 max-w-md text-lg text-white/90">
                List free. We verify you, send pre-qualified residents, and charge
                commission only on bookings we bring.
              </p>
              <Link href="/host/signup" className="btn-accent mt-8 px-6 py-3.5">
                List your property
              </Link>
            </div>
            <div className="relative min-h-[280px]">
              <div className="absolute inset-0">
                <Photo
                  name="balconies"
                  aspect={4 / 3}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

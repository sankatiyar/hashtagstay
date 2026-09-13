import Link from 'next/link';

import { Icon, type IconName } from './icons';

type Params = { type?: string; gender?: string; occupancy?: string; city?: string };

const CATEGORIES: { label: string; icon: IconName; params: Params }[] = [
  { label: 'All stays', icon: 'grid', params: {} },
  { label: 'Co-living', icon: 'sofa', params: { type: 'coliving' } },
  { label: 'Student housing', icon: 'cap', params: { type: 'pbsa' } },
  { label: 'Women-only', icon: 'shield', params: { gender: 'female_only' } },
  { label: 'Private rooms', icon: 'key', params: { occupancy: '1' } },
  { label: 'Home sharing', icon: 'home', params: { type: 'homeshare' } },
];

const FILTER_KEYS = ['type', 'gender', 'occupancy', 'city'] as const;

function hrefFor(params: Params) {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  );
  const query = search.toString();
  return query ? `/search?${query}` : '/search';
}

/**
 * The icon strip under the header. Plain links, so every category is a
 * crawlable, shareable search URL.
 */
export function CategoryBar({
  active = {},
  cities = [],
}: {
  active?: Params;
  cities?: { city: string }[];
}) {
  const items = [
    ...CATEGORIES,
    ...cities.map((c) => ({
      label: c.city,
      icon: 'building' as IconName,
      params: { city: c.city },
    })),
  ];

  const isActive = (params: Params) =>
    FILTER_KEYS.every((key) => (params[key] ?? '') === (active[key] ?? ''));

  return (
    <nav aria-label="Categories" className="scrollbar-none -mb-px flex gap-8 overflow-x-auto">
      {items.map((item) => {
        const on = isActive(item.params);
        return (
          <Link
            key={item.label}
            href={hrefFor(item.params)}
            aria-current={on ? 'page' : undefined}
            className={`group flex shrink-0 flex-col items-center gap-2 border-b-2 pt-3 pb-3 text-xs font-semibold transition ${on ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:border-line hover:text-ink'}`}
          >
            <Icon
              name={item.icon}
              className={`h-6 w-6 transition ${on ? 'text-brand-600' : 'opacity-70 group-hover:opacity-100'}`}
              strokeWidth={1.7}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

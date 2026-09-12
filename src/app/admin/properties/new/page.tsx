import Link from 'next/link';

import { requirePermission } from '@/lib/auth/guard';

export const metadata = {
  title: 'Add property · #HashtagStay ops',
  robots: { index: false, follow: false },
};

/**
 * Placeholder. The create form is the next increment of M1; listing an existing
 * property, moving it through its lifecycle and confirming availability all work
 * already, so this is the remaining gap rather than a blocker.
 *
 * It is a real route rather than a missing one so the "Add property" button does
 * not 404.
 */
export default async function NewPropertyPage() {
  await requirePermission('property:create', {
    returnTo: '/admin/properties/new',
  });

  return (
    <div className="max-w-xl space-y-4">
      <Link
        href="/admin/properties"
        className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
      >
        ← Inventory
      </Link>

      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">
          Add property — not built yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          The create form is the next piece of work. It needs the full field set
          (address, coordinates, room types, amenities) plus media upload, which is a
          larger surface than the rest of this screen.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Until then, seed inventory with <code>npm run db:seed</code>, or insert
          directly and manage the listing from its detail page — lifecycle transitions
          and availability confirmation are working.
        </p>
      </div>
    </div>
  );
}

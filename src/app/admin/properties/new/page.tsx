import Link from 'next/link';

import { requirePermission } from '@/lib/auth/guard';
import { listOrganizationOptions, listPropertyCities } from '@/lib/services/properties';

import { PropertyForm } from './property-form';

export const metadata = {
  title: 'Add property · Sandy Stays ops',
  robots: { index: false, follow: false },
};

export default async function NewPropertyPage() {
  await requirePermission('property:create', {
    returnTo: '/admin/properties/new',
  });

  const [organizations, cities] = await Promise.all([
    listOrganizationOptions(),
    listPropertyCities(),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          href="/admin/properties"
          className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
        >
          ← Inventory
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
          Add property
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Saved as a draft, then submitted for verification. Photos are added separately
          — media upload is not built yet.
        </p>
      </div>

      {organizations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6">
          <p className="text-sm font-medium text-amber-900">
            No operators to attach a property to.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            A property always belongs to one operator, so an operator has to exist
            first. Operator onboarding is not in this console yet — seed one with{' '}
            <code>npm run db:seed</code>, or insert it directly for now.
          </p>
        </div>
      ) : (
        <PropertyForm organizations={organizations} cities={cities} />
      )}
    </div>
  );
}

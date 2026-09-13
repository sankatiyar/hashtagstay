import Link from 'next/link';

import { PropertyForm } from '@/app/admin/properties/new/property-form';
import { requireHost } from '@/lib/auth/host';
import { listPropertyCities } from '@/lib/services/properties';

import { hostCreatePropertyAction } from '../../actions';

export default async function HostNewPropertyPage() {
  const ctx = await requireHost('/host/properties/new');
  const cities = await listPropertyCities();

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/host/properties" className="text-sm text-slate-500 hover:underline">
        ← Properties
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Add a property
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Saved as a draft. Add photos and documents next, then send it for
          verification. Residents only see verified listings.
        </p>
      </div>
      <PropertyForm
        organizations={ctx.memberships.map((m) => ({
          id: m.organizationId,
          name: m.organizationName,
        }))}
        cities={cities}
        action={hostCreatePropertyAction}
      />
    </div>
  );
}

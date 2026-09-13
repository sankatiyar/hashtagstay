import { ActionForm } from '@/components/ui/action-form';
import { requireStaff } from '@/lib/auth/guard';
import { formatPhone } from '@/lib/phone';
import { getStaffProfile } from '@/lib/services/staff';

import { saveProfileAction } from './actions';

export const metadata = {
  title: 'My desk settings · #HashtagStay ops',
  robots: { index: false, follow: false },
};

const input =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900';

export default async function ProfilePage() {
  const user = await requireStaff('/admin/profile');
  const { profile, user: record } = await getStaffProfile(user.id);

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          My desk settings
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Your phone is what click-to-call rings. Cities and languages decide which new
          leads are routed to you.
        </p>
      </div>
      <ActionForm
        action={saveProfileAction}
        submitLabel="Save"
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <label className="block text-sm text-slate-700">
          My mobile number
          <input
            name="phone"
            defaultValue={record?.phone ? formatPhone(record.phone) : ''}
            className={input}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Cities I cover (comma separated; blank = any)
          <input
            name="cities"
            defaultValue={profile?.cities.join(', ') ?? ''}
            className={input}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Languages (codes, e.g. en, hi, kn)
          <input
            name="languages"
            defaultValue={profile?.languages.join(', ') ?? 'en, hi'}
            className={input}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Maximum open leads
          <input
            name="maxActiveLeads"
            defaultValue={profile?.maxActiveLeads ?? 40}
            className={input}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="isAcceptingLeads"
            defaultChecked={profile?.isAcceptingLeads ?? true}
            className="h-4 w-4"
          />
          Accepting new leads
        </label>
      </ActionForm>
    </div>
  );
}

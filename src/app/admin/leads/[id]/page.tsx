import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createBookingAction } from '@/app/admin/bookings/actions';
import { BookingControls } from '@/components/admin/booking-controls';
import {
  BookingStateBadge,
  CALL_DISPOSITIONS,
  CHANNEL_LABELS,
  LOST_REASONS,
  LeadStateBadge,
  SlaBadge,
  istDateTime,
} from '@/components/admin/status';
import { ActionForm } from '@/components/ui/action-form';
import { Badge, VerificationBadge } from '@/components/ui/badge';
import { requireStaff } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { format, money } from '@/lib/money';
import { maskPhone } from '@/lib/phone';
import { bookableRooms } from '@/lib/services/desk';
import { getLeadWorkspace, listAssignableStaff } from '@/lib/services/leads';
import { absoluteUrl } from '@/lib/seo';
import { type BookingState, allowedFrom, leadMachine } from '@/lib/state-machines';
import { isoDate } from '@/lib/time';

import {
  assignAction,
  createShortlistAction,
  dispositionAction,
  followUpAction,
  noteAction,
  placeCallAction,
  requirementAction,
  shareShortlistAction,
  transitionAction,
} from './actions';

export const metadata = {
  title: 'Lead · Sandy Stays ops',
  robots: { index: false, follow: false },
};

const input =
  'block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900';

const ACTIVITY_LABEL: Record<string, string> = {
  created: 'Enquiry',
  duplicate_enquiry: 'Repeat enquiry',
  assignment: 'Assignment',
  call: 'Call',
  call_outcome: 'Call outcome',
  note: 'Note',
  state_change: 'State',
  follow_up: 'Follow-up',
  requirement_updated: 'Requirement',
  shortlist_created: 'Shortlist',
  shortlist_shared: 'Shortlist sent',
  shortlist_viewed: 'Shortlist opened',
  shortlist_interest: 'Resident reaction',
  booking_created: 'Booking',
  host_confirmed: 'Operator confirmed',
  host_declined: 'Operator declined',
  payment_link_sent: 'Payment link',
  booking_confirmed: 'Booked',
  booking_cancelled: 'Cancelled',
  sla_breach: 'SLA breach',
};

export default async function LeadWorkspace(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await requireStaff(`/admin/leads/${id}`);
  const workspace = await getLeadWorkspace(id, user);
  if (workspace === null) notFound();
  if (workspace === 'forbidden') redirect('/admin/denied');

  const { lead } = workspace;
  const closed = ['won', 'lost', 'disqualified'].includes(lead.state);
  const [rooms, staff] = await Promise.all([
    bookableRooms(lead.requirementCity),
    can(user.roles, 'lead:assign') ? listAssignableStaff() : Promise.resolve([]),
  ]);
  const nextStates = allowedFrom(leadMachine, lead.state).filter(
    (s) => !['booking_initiated', 'won'].includes(s),
  );
  const openCall = workspace.calls.find((call) => !call.disposition);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/leads" className="text-sm text-slate-500 hover:underline">
          ← Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {lead.contactName ?? 'Unnamed lead'}
            </h1>
            <p className="text-sm text-slate-500">
              {lead.reference} · {maskPhone(lead.guardianPhone ?? lead.contactPhone)}
              {lead.guardianName && ` · guardian ${lead.guardianName}`} ·{' '}
              {CHANNEL_LABELS[lead.channel] ?? lead.channel}
              {lead.utmCampaign && ` / ${lead.utmCampaign}`} · created{' '}
              {istDateTime(lead.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LeadStateBadge state={lead.state} />
            <SlaBadge status={workspace.sla} />
            {lead.phoneVerifiedAt ? (
              <Badge tone="success">Phone verified</Badge>
            ) : (
              <Badge tone="warning">Unverified</Badge>
            )}
            <Badge tone="neutral">{workspace.assignedToName ?? 'Unassigned'}</Badge>
          </div>
        </div>
        {lead.guardianName && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Under-18 enquiry. Speak to the guardian; calls go to their number.
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Requirement</h2>
            <ActionForm
              action={requirementAction}
              submitLabel="Save requirement"
              tone="secondary"
              className="mt-3 space-y-3"
            >
              <input type="hidden" name="leadId" value={id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-slate-600">
                  City
                  <input
                    name="city"
                    defaultValue={lead.requirementCity ?? ''}
                    className={input}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Budget ₹/month
                  <input
                    name="budget"
                    defaultValue={
                      lead.budgetMaxAmountMinor ? lead.budgetMaxAmountMinor / 100 : ''
                    }
                    className={input}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Move-in
                  <input
                    type="date"
                    name="moveInDate"
                    defaultValue={isoDate(lead.moveInDate) ?? ''}
                    className={input}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Tenure (months)
                  <input
                    name="tenureMonths"
                    defaultValue={lead.tenureMonths ?? ''}
                    className={input}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Beds in room
                  <input
                    name="occupancy"
                    defaultValue={lead.requirementOccupancy ?? ''}
                    className={input}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Gender
                  <select
                    name="genderPolicy"
                    defaultValue={lead.requirementGenderPolicy ?? ''}
                    className={input}
                  >
                    <option value="">Any</option>
                    <option value="female_only">Women-only</option>
                    <option value="male_only">Men-only</option>
                    <option value="any">Mixed</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs text-slate-600">
                Notes
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={lead.requirementNotes ?? ''}
                  className={input}
                />
              </label>
              {workspace.institutionName && (
                <p className="text-xs text-slate-500">
                  Campus: {workspace.institutionName}
                </p>
              )}
            </ActionForm>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Shortlist</h2>
            {workspace.shortlists.length > 0 && (
              <ul className="mt-3 space-y-2">
                {workspace.shortlists.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-3 text-sm"
                  >
                    <div>
                      <a
                        href={absoluteUrl(`/s/${s.publicToken}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-900 underline"
                      >
                        Shortlist from {istDateTime(s.createdAt)}
                      </a>
                      <p className="text-xs text-slate-500">
                        {s.sharedAt ? `sent ${istDateTime(s.sharedAt)}` : 'not sent'} ·{' '}
                        {s.viewCount} views · expires {isoDate(s.expiresAt)}
                      </p>
                    </div>
                    {can(user.roles, 'shortlist:share') && !closed && (
                      <ActionForm
                        action={shareShortlistAction}
                        submitLabel={s.sharedAt ? 'Resend' : 'Send to resident'}
                        tone="secondary"
                        inline
                      >
                        <input type="hidden" name="leadId" value={id} />
                        <input type="hidden" name="shortlistId" value={s.id} />
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!closed && can(user.roles, 'shortlist:create') && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-700 underline">
                  Build a new shortlist
                </summary>
                {rooms.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    No live rooms in {lead.requirementCity ?? 'this city'}.
                  </p>
                ) : (
                  <ActionForm
                    action={createShortlistAction}
                    submitLabel="Create shortlist"
                    className="mt-3 space-y-3"
                  >
                    <input type="hidden" name="leadId" value={id} />
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {rooms.map((room) => {
                        const value = `${room.propertyId}:${room.roomTypeId}`;
                        const overBudget =
                          lead.budgetMaxAmountMinor !== null &&
                          room.rentAmountMinor > lead.budgetMaxAmountMinor;
                        return (
                          <div
                            key={value}
                            className="rounded-md border border-slate-100 p-2.5 text-sm"
                          >
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                name="room"
                                value={value}
                                className="mt-1 h-4 w-4"
                              />
                              <span>
                                <span className="font-medium text-slate-900">
                                  {room.propertyName}
                                </span>{' '}
                                — {room.roomName}
                                <span className="block text-xs text-slate-500">
                                  {room.locality ?? room.city} ·{' '}
                                  {format(money(room.rentAmountMinor, 'INR'))}
                                  {overBudget && (
                                    <span className="text-amber-700">
                                      {' '}
                                      (over budget)
                                    </span>
                                  )}{' '}
                                  · {room.bedsFree ?? 0} free, confirmed{' '}
                                  {isoDate(room.lastConfirmedAt) ?? 'never'} · min{' '}
                                  {room.minTenureMonths} mo
                                </span>
                              </span>
                            </label>
                            <input
                              name={`note:${value}`}
                              placeholder="Why this one (shown to resident)"
                              className={`${input} mt-2`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <textarea
                      name="message"
                      rows={2}
                      placeholder="Message to the resident (optional)"
                      className={input}
                    />
                  </ActionForm>
                )}
              </details>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Bookings</h2>
            {workspace.bookings.length > 0 && (
              <ul className="mt-3 space-y-3">
                {workspace.bookings.map((b) => (
                  <li key={b.id} className="rounded-md border border-slate-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {b.reference} · {b.propertyName}
                      </Link>
                      <BookingStateBadge state={b.state} />
                    </div>
                    <p className="text-xs text-slate-500">
                      move-in {isoDate(b.moveInDate)}
                    </p>
                    <div className="mt-2">
                      <BookingControls
                        bookingId={b.id}
                        leadId={id}
                        state={b.state as BookingState}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!closed && can(user.roles, 'booking:create') && rooms.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-700 underline">
                  Start a booking
                </summary>
                <ActionForm
                  action={createBookingAction}
                  submitLabel="Start booking"
                  className="mt-3 space-y-3"
                >
                  <input type="hidden" name="leadId" value={id} />
                  <select name="room" className={input} defaultValue="">
                    <option value="" disabled>
                      Choose room
                    </option>
                    {rooms.map((room) => (
                      <option
                        key={room.roomTypeId}
                        value={`${room.propertyId}:${room.roomTypeId}`}
                      >
                        {room.propertyName} — {room.roomName} (
                        {format(money(room.rentAmountMinor, 'INR'))}, min{' '}
                        {room.minTenureMonths} mo)
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-600">
                      Move-in
                      <input
                        type="date"
                        name="moveInDate"
                        defaultValue={isoDate(lead.moveInDate) ?? ''}
                        className={input}
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      Tenure (months)
                      <input
                        name="tenureMonths"
                        defaultValue={lead.tenureMonths ?? 11}
                        className={input}
                      />
                    </label>
                    <label className="text-xs text-slate-600">
                      Agreed rent ₹ (blank = listed)
                      <input name="monthlyRent" className={input} />
                    </label>
                    <label className="text-xs text-slate-600">
                      Agreed deposit ₹ (blank = listed)
                      <input name="deposit" className={input} />
                    </label>
                  </div>
                </ActionForm>
              </details>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
            <ActionForm
              action={noteAction}
              submitLabel="Add note"
              tone="secondary"
              className="mt-3 space-y-2"
            >
              <input type="hidden" name="leadId" value={id} />
              <textarea
                name="body"
                rows={2}
                placeholder="What happened, what was promised"
                className={input}
              />
            </ActionForm>
            <ol className="mt-4 space-y-3 border-l border-slate-200 pl-4">
              {workspace.activities.map((activity) => (
                <li key={activity.id} className="text-sm">
                  <p className="text-xs text-slate-500">
                    {istDateTime(activity.createdAt)} ·{' '}
                    {ACTIVITY_LABEL[activity.kind] ?? activity.kind}
                    {activity.actorName && ` · ${activity.actorName}`}
                  </p>
                  {activity.body && <p className="text-slate-800">{activity.body}</p>}
                  {activity.kind === 'state_change' && (
                    <p className="text-slate-700">
                      {String((activity.detail as Record<string, unknown>).from ?? '')}{' '}
                      → {String((activity.detail as Record<string, unknown>).to ?? '')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          {can(user.roles, 'call:place') && !closed && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Call</h2>
              <p className="mt-1 text-xs text-slate-500">
                Your phone rings first, then the resident is connected on a masked
                number. The call is recorded with a disclosure.
              </p>
              <div className="mt-3">
                <ActionForm action={placeCallAction} submitLabel="Call resident">
                  <input type="hidden" name="leadId" value={id} />
                </ActionForm>
              </div>
              {openCall && (
                <ActionForm
                  action={dispositionAction}
                  submitLabel="Save outcome"
                  tone="secondary"
                  className="mt-4 space-y-2 border-t border-slate-100 pt-4"
                >
                  <p className="text-xs text-slate-600">
                    Outcome of call at {istDateTime(openCall.startedAt)}
                  </p>
                  <input type="hidden" name="leadId" value={id} />
                  <input type="hidden" name="callId" value={openCall.id} />
                  <select name="disposition" className={input}>
                    {CALL_DISPOSITIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    name="durationMinutes"
                    placeholder="Minutes talked"
                    className={input}
                  />
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="Call notes"
                    className={input}
                  />
                </ActionForm>
              )}
              {workspace.calls.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  {workspace.calls.length} call{workspace.calls.length === 1 ? '' : 's'}{' '}
                  so far
                </p>
              )}
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Follow-up</h2>
            <ActionForm
              action={followUpAction}
              submitLabel="Set"
              tone="secondary"
              className="mt-2 space-y-2"
            >
              <input type="hidden" name="leadId" value={id} />
              <input
                type="datetime-local"
                name="at"
                defaultValue={
                  lead.nextFollowUpAt
                    ? new Date(lead.nextFollowUpAt.getTime() + 330 * 60_000)
                        .toISOString()
                        .slice(0, 16)
                    : ''
                }
                className={input}
              />
            </ActionForm>
          </section>

          {nextStates.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Move lead</h2>
              <div className="mt-3 space-y-3">
                {nextStates.map((to) => (
                  <ActionForm
                    key={to}
                    action={transitionAction}
                    submitLabel={to.replaceAll('_', ' ')}
                    tone={
                      to === 'lost' || to === 'disqualified' ? 'danger' : 'secondary'
                    }
                    className="space-y-2"
                  >
                    <input type="hidden" name="leadId" value={id} />
                    <input type="hidden" name="to" value={to} />
                    {to === 'lost' && (
                      <select name="lostReason" className={input} defaultValue="">
                        <option value="" disabled>
                          Why was it lost?
                        </option>
                        {LOST_REASONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  </ActionForm>
                ))}
              </div>
            </section>
          )}

          {staff.length > 0 && !closed && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Assign</h2>
              <ActionForm
                action={assignAction}
                submitLabel="Assign"
                tone="secondary"
                className="mt-2 space-y-2"
              >
                <input type="hidden" name="leadId" value={id} />
                <select
                  name="toUserId"
                  defaultValue={lead.assignedToUserId ?? ''}
                  className={input}
                >
                  <option value="" disabled>
                    Choose RM
                  </option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ?? s.email}
                    </option>
                  ))}
                </select>
              </ActionForm>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600">
            <h2 className="text-sm font-semibold text-slate-900">Attribution</h2>
            <dl className="mt-2 space-y-1">
              {(
                [
                  ['Source', lead.utmSource],
                  ['Medium', lead.utmMedium],
                  ['Campaign', lead.utmCampaign],
                  ['Landing page', lead.landingPagePath],
                  ['Referrer', lead.referrerUrl],
                  ['Google click', lead.gclid ? 'yes' : null],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt>{label}</dt>
                  <dd className="truncate text-right text-slate-800">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
          <VerificationBadge tier="none" />
        </aside>
      </div>
    </div>
  );
}

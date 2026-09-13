import { Badge } from '@/components/ui/badge';
import type { SlaStatus } from '@/lib/sla';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const LEAD: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'info' },
  contacting: { label: 'Contacting', tone: 'warning' },
  qualified: { label: 'Qualified', tone: 'info' },
  shortlist_shared: { label: 'Shortlist sent', tone: 'info' },
  negotiating: { label: 'Negotiating', tone: 'warning' },
  booking_initiated: { label: 'Booking', tone: 'warning' },
  won: { label: 'Won', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
  disqualified: { label: 'Disqualified', tone: 'muted' },
  nurture: { label: 'Nurture', tone: 'neutral' },
};

export function LeadStateBadge({ state }: { state: string }) {
  const meta = LEAD[state] ?? { label: state, tone: 'neutral' as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

const SLA: Record<SlaStatus, { label: string; tone: Tone; title: string }> = {
  breached: {
    label: 'SLA breached',
    tone: 'danger',
    title: 'First call deadline missed.',
  },
  due_soon: {
    label: 'Call now',
    tone: 'warning',
    title: 'First call is due within 2 minutes.',
  },
  on_track: {
    label: 'On track',
    tone: 'muted',
    title: 'Within the first-call window.',
  },
  met: { label: 'SLA met', tone: 'success', title: 'Called before the deadline.' },
};

export function SlaBadge({ status }: { status: SlaStatus }) {
  const meta = SLA[status];
  return (
    <Badge tone={meta.tone} title={meta.title}>
      {meta.label}
    </Badge>
  );
}

const BOOKING: Record<string, { label: string; tone: Tone }> = {
  initiated: { label: 'Started', tone: 'info' },
  pending_host_confirmation: { label: 'Awaiting operator', tone: 'warning' },
  fee_pending: { label: 'Awaiting fee', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  moved_in: { label: 'Moved in', tone: 'success' },
  completed: { label: 'Completed', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'muted' },
};

export function BookingStateBadge({ state }: { state: string }) {
  const meta = BOOKING[state] ?? { label: state, tone: 'neutral' as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

const PAYMENT: Record<string, Tone> = {
  created: 'muted',
  pending: 'warning',
  authorized: 'info',
  captured: 'success',
  failed: 'danger',
  refund_pending: 'warning',
  refunded: 'muted',
  partially_refunded: 'muted',
};

export function PaymentStateBadge({ state }: { state: string }) {
  return <Badge tone={PAYMENT[state] ?? 'neutral'}>{state.replaceAll('_', ' ')}</Badge>;
}

/** IST date-time for staff screens. */
export function istDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CHANNEL_LABELS: Record<string, string> = {
  organic_search: 'Google/organic',
  paid_search: 'Paid search',
  paid_social: 'Paid social',
  organic_social: 'Social',
  direct: 'Direct',
  referral: 'Referral',
  partner: 'Partner',
  whatsapp: 'WhatsApp',
  click_to_call: 'Call',
  offline: 'Offline',
};

export const LOST_REASONS = [
  ['no_inventory_match', 'No suitable inventory'],
  ['budget_too_low', 'Budget too low'],
  ['unreachable', 'Unreachable'],
  ['booked_elsewhere', 'Booked elsewhere'],
  ['plans_changed', 'Plans changed'],
  ['price_objection', 'Price objection'],
  ['location_objection', 'Location objection'],
  ['other', 'Other'],
] as const;

export const CALL_DISPOSITIONS = [
  ['connected', 'Connected'],
  ['no_answer', 'No answer'],
  ['busy', 'Busy'],
  ['switched_off', 'Switched off'],
  ['call_back_later', 'Asked to call back'],
  ['wrong_person', 'Wrong person'],
  ['invalid_number', 'Invalid number'],
  ['failed', 'Call failed'],
] as const;

export const CANCEL_REASONS = [
  ['resident_withdrew', 'Resident withdrew'],
  ['host_unavailable', 'Operator could not host'],
  ['payment_failed', 'Payment failed'],
  ['verification_failed', 'Verification failed'],
  ['duplicate', 'Duplicate booking'],
  ['other', 'Other'],
] as const;

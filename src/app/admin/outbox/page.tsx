import { istDateTime } from '@/components/admin/status';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/guard';
import { maskPhone } from '@/lib/phone';
import { recentNotifications } from '@/lib/services/desk';

export const metadata = {
  title: 'Outbox · #HashtagStay ops',
  robots: { index: false, follow: false },
};

const TONE: Record<string, 'success' | 'danger' | 'warning' | 'muted' | 'info'> = {
  sent: 'success',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
  suppressed: 'muted',
  queued: 'warning',
};

/**
 * Every message the platform sent, failed to send, or deliberately suppressed.
 * In development, where SMS/WhatsApp/email are not configured, this is where
 * you read what a resident or operator would have received. Sensitive values
 * such as OTP codes are masked in the stored copy.
 */
export default async function OutboxPage() {
  await requirePermission('report:view', { returnTo: '/admin/outbox' });
  const rows = await recentNotifications();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Outbox</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          The last {rows.length} messages. Provider “dev-outbox” means the channel is
          not configured and nothing was really sent.
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map((n) => (
          <li
            key={n.id}
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {istDateTime(n.createdAt)} · {n.channel} · {n.templateKey} · to{' '}
                {n.channel === 'email'
                  ? n.recipientAddress
                  : maskPhone(n.recipientAddress)}{' '}
                · {n.provider ?? '—'}
              </p>
              <Badge tone={TONE[n.state] ?? 'info'}>{n.state}</Badge>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{n.renderedBody}</p>
            {(n.failureReason || n.suppressionReason) && (
              <p className="mt-1 text-xs text-red-700">
                {n.failureReason ?? n.suppressionReason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { notificationTemplates, notifications } from '@/lib/db/schema';
import { serverEnv } from '@/lib/env';
import { latestConsentState } from '@/lib/services/consent';

import {
  type Channel,
  TemplateError,
  redact,
  renderTemplate,
  templateByKey,
} from './templates';

/**
 * Outbound messaging: SMS, WhatsApp and email (FR-22, FR-14, lead
 * acknowledgement, OTP).
 *
 * Every message — sent, failed or deliberately suppressed — becomes a row in
 * `notifications`. That log is how ops sees what a resident was actually told,
 * and a suppressed row is the evidence that a consent withdrawal was honoured.
 *
 * Providers:
 *  - SMS: MSG91 flow API (DLT template id per message)
 *  - WhatsApp: AiSensy campaign API (Meta-approved template name per message)
 *  - Email: Resend
 *  - **Dev outbox** when a channel is not configured and NODE_ENV is not
 *    production. The message is logged and marked sent so the whole workflow
 *    can be exercised; view it at /admin/outbox.
 *
 * Provider calls follow the vendors' documented APIs and have not yet been run
 * against live accounts — verify on first credentials.
 */

export interface SendInput {
  templateKey: string;
  channel: Channel;
  /** E.164 phone for SMS/WhatsApp, address for email. */
  to: string;
  variables: Record<string, string | number>;
  recipientUserId?: string | null;
  leadId?: string | null;
  bookingId?: string | null;
  locale?: string;
}

export interface SendResult {
  notificationId: string;
  state: 'sent' | 'failed' | 'suppressed';
  provider: string;
  failureReason?: string;
}

/** Templates a resident explicitly triggered, exempt from consent suppression. */
const USER_INITIATED = new Set(['otp.verify']);

interface ResolvedTemplate {
  subject: string | null;
  body: string;
  providerTemplateName: string | null;
  templateId: string | null;
}

async function resolveTemplate(
  key: string,
  channel: Channel,
  locale: string,
): Promise<ResolvedTemplate> {
  const [override] = await db
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.key, key),
        eq(notificationTemplates.channel, channel),
        eq(notificationTemplates.locale, locale),
        eq(notificationTemplates.isActive, true),
      ),
    )
    .limit(1);

  if (override) {
    return {
      subject: override.subject,
      body: override.body,
      providerTemplateName: override.providerTemplateName,
      templateId: override.id,
    };
  }

  const builtIn = templateByKey(key);
  if (!builtIn || !builtIn.channels.includes(channel)) {
    throw new TemplateError(`No template "${key}" for channel ${channel}.`);
  }
  return {
    subject: builtIn.subject ?? null,
    body: builtIn.body,
    providerTemplateName: null,
    templateId: null,
  };
}

type Dispatch =
  | { ok: true; provider: string; providerMessageId: string | null }
  | { ok: false; provider: string; reason: string };

async function dispatch(
  input: SendInput,
  template: ResolvedTemplate,
  text: string,
  subject: string | null,
): Promise<Dispatch> {
  const e = serverEnv();

  if (input.channel === 'sms' && e.SMS_PROVIDER === 'msg91' && e.SMS_API_KEY) {
    const flowId =
      template.providerTemplateName ??
      (input.templateKey === 'otp.verify' ? e.SMS_OTP_TEMPLATE_ID : undefined);
    if (!flowId) {
      return {
        ok: false,
        provider: 'msg91',
        reason: `No DLT flow id for "${input.templateKey}". Add it as the template's provider name.`,
      };
    }
    const response = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: e.SMS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: flowId,
        short_url: '0',
        recipients: [{ mobiles: input.to.replace(/^\+/, ''), ...input.variables }],
      }),
    });
    if (!response.ok) {
      return { ok: false, provider: 'msg91', reason: `MSG91 ${response.status}` };
    }
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    return { ok: true, provider: 'msg91', providerMessageId: body.message ?? null };
  }

  if (
    input.channel === 'whatsapp' &&
    e.WHATSAPP_PROVIDER === 'aisensy' &&
    e.WHATSAPP_API_KEY
  ) {
    if (!template.providerTemplateName) {
      return {
        ok: false,
        provider: 'aisensy',
        reason: `No approved WhatsApp campaign for "${input.templateKey}".`,
      };
    }
    const response = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: e.WHATSAPP_API_KEY,
        campaignName: template.providerTemplateName,
        destination: input.to,
        userName: String(input.variables.name ?? 'Resident'),
        templateParams: Object.values(input.variables).map(String),
      }),
    });
    if (!response.ok) {
      return { ok: false, provider: 'aisensy', reason: `AiSensy ${response.status}` };
    }
    return { ok: true, provider: 'aisensy', providerMessageId: null };
  }

  if (input.channel === 'email' && e.EMAIL_PROVIDER === 'resend' && e.EMAIL_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: e.EMAIL_FROM ?? 'Sandy Stays <no-reply@hashtagstay.example>',
        to: input.to,
        subject: subject ?? 'Sandy Stays',
        text,
      }),
    });
    if (!response.ok) {
      return { ok: false, provider: 'resend', reason: `Resend ${response.status}` };
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, provider: 'resend', providerMessageId: body.id ?? null };
  }

  if (e.NODE_ENV !== 'production' || e.DEMO_MODE) {
    console.info(`[dev-outbox] ${input.channel} → ${input.to}: ${input.templateKey}`);
    return { ok: true, provider: 'dev-outbox', providerMessageId: null };
  }

  return {
    ok: false,
    provider: 'none',
    reason: `The ${input.channel} channel is not configured.`,
  };
}

/**
 * Send one message. Provider failures are recorded, not thrown — a failed
 * WhatsApp must not roll back the enquiry that triggered it. Template errors
 * (a missing variable) do throw, because they are bugs.
 */
export async function sendNotification(input: SendInput): Promise<SendResult> {
  const locale = input.locale ?? 'en-IN';
  const template = await resolveTemplate(input.templateKey, input.channel, locale);
  const definition = templateByKey(input.templateKey) ?? {};

  const text = renderTemplate(template.body, input.variables);
  const subject = template.subject
    ? renderTemplate(template.subject, input.variables)
    : null;
  const logged = redact(definition, template.body, input.variables);

  const base = {
    templateId: template.templateId,
    templateKey: input.templateKey,
    channel: input.channel,
    recipientUserId: input.recipientUserId ?? null,
    recipientAddress: input.to,
    leadId: input.leadId ?? null,
    bookingId: input.bookingId ?? null,
    renderedBody: logged,
    variables: Object.fromEntries(
      Object.entries(input.variables).map(([k, v]) =>
        (definition as { sensitive?: readonly string[] }).sensitive?.includes(k)
          ? [k, '••••••']
          : [k, v],
      ),
    ),
  };

  if (!USER_INITIATED.has(input.templateKey)) {
    const consent = await latestConsentState(input.to, 'lead_contact');
    if (consent === 'withdrawn') {
      const [row] = await db
        .insert(notifications)
        .values({
          ...base,
          state: 'suppressed',
          provider: 'none',
          suppressionReason: 'Contact consent withdrawn',
        })
        .returning({ id: notifications.id });
      return { notificationId: row.id, state: 'suppressed', provider: 'none' };
    }
  }

  const [row] = await db
    .insert(notifications)
    .values({ ...base, state: 'queued' })
    .returning({ id: notifications.id });

  let result: Dispatch;
  try {
    result = await dispatch(input, template, text, subject);
  } catch (error) {
    result = {
      ok: false,
      provider: 'unknown',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const now = new Date();
  if (result.ok) {
    await db
      .update(notifications)
      .set({
        state: 'sent',
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        sentAt: now,
        attemptCount: 1,
        updatedAt: now,
      })
      .where(eq(notifications.id, row.id));
    return { notificationId: row.id, state: 'sent', provider: result.provider };
  }

  await db
    .update(notifications)
    .set({
      state: 'failed',
      provider: result.provider,
      failedAt: now,
      failureReason: result.reason,
      attemptCount: 1,
      updatedAt: now,
    })
    .where(eq(notifications.id, row.id));
  return {
    notificationId: row.id,
    state: 'failed',
    provider: result.provider,
    failureReason: result.reason,
  };
}

/**
 * Preferred messaging channel for a phone. WhatsApp when configured (higher
 * read rate in India), otherwise SMS; in development the outbox takes either.
 */
export function phoneChannel(): Channel {
  const e = serverEnv();
  if (e.WHATSAPP_PROVIDER !== 'none' && e.WHATSAPP_API_KEY) return 'whatsapp';
  return 'sms';
}

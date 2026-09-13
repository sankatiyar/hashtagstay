/**
 * Built-in message templates.
 *
 * These are the defaults. An active row in `notification_templates` for the
 * same key, channel and locale overrides them — which is how an approved
 * WhatsApp template's exact wording and provider template name get used in
 * production. Meta rejects proactive WhatsApp messages that do not match an
 * approved template, so the database row is authoritative once it exists.
 *
 * All templates here are transactional. None is marketing, so none needs
 * marketing consent; all of them still respect a withdrawn contact consent.
 */

export type Channel = 'email' | 'sms' | 'whatsapp';

export interface TemplateDefinition {
  readonly key: string;
  readonly channels: readonly Channel[];
  readonly subject?: string;
  readonly body: string;
  /** Variables whose value must never be stored in the sent-message log. */
  readonly sensitive?: readonly string[];
}

export const TEMPLATES: readonly TemplateDefinition[] = [
  {
    key: 'otp.verify',
    channels: ['sms'],
    body: 'Your Sandy Stays verification code is {{code}}. It expires in 10 minutes. Never share this code with anyone, including our staff.',
    sensitive: ['code'],
  },
  {
    key: 'lead.acknowledgement',
    channels: ['whatsapp', 'sms'],
    body: 'Hi {{name}}, thanks for your enquiry ({{reference}}). A Sandy Stays relationship manager will call you {{when}}. Reply to this message if you need us sooner.',
  },
  {
    key: 'shortlist.shared',
    channels: ['whatsapp', 'sms'],
    body: 'Hi {{name}}, {{rm_name}} has picked {{count}} stays for you: {{url}} — prices are held as quoted until {{expires}}.',
  },
  {
    key: 'booking.host_confirmation_request',
    channels: ['sms', 'email'],
    subject: 'Please confirm availability for booking {{reference}}',
    body: 'Booking request {{reference}} for {{property}}: {{room}}, move-in {{move_in}}, {{tenure}} months. Please confirm the bed is available: {{url}}',
  },
  {
    key: 'booking.payment_link',
    channels: ['whatsapp', 'sms'],
    body: 'Hi {{name}}, {{property}} has confirmed your room. Pay the Sandy Stays facilitation fee of {{amount}} to secure it: {{url}}',
  },
  {
    key: 'booking.confirmed_resident',
    channels: ['whatsapp', 'sms', 'email'],
    subject: 'Your booking {{reference}} is confirmed',
    body: 'Booking {{reference}} is confirmed at {{property}} ({{room}}), move-in {{move_in}}. Rent and deposit are paid directly to the operator as agreed. Your relationship manager {{rm_name}} will share move-in details. Help: {{support_url}}',
  },
  {
    key: 'booking.confirmed_host',
    channels: ['sms', 'email'],
    subject: 'Booking {{reference}} confirmed',
    body: 'Booking {{reference}} is confirmed: {{resident}} is moving into {{room}} at {{property}} on {{move_in}} for {{tenure}} months.',
  },
  {
    key: 'booking.cancelled',
    channels: ['whatsapp', 'sms', 'email'],
    subject: 'Booking {{reference}} cancelled',
    body: 'Booking {{reference}} at {{property}} has been cancelled. {{refund_note}}',
  },
  {
    key: 'ticket.update',
    channels: ['sms', 'email'],
    subject: 'Update on your request {{reference}}',
    body: 'There is an update on your Sandy Stays request {{reference}}: {{summary}} View it here: {{url}}',
  },
];

const BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

export const templateByKey = (key: string): TemplateDefinition | undefined =>
  BY_KEY.get(key);

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

/**
 * Fill `{{variables}}`. A missing variable throws rather than sending a message
 * with a blank hole in it — "your code is ." is worse than a failed send that
 * shows up in the outbox.
 */
export function renderTemplate(
  text: string,
  variables: Record<string, string | number>,
): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, name: string) => {
    if (!(name in variables)) {
      throw new TemplateError(`Template variable "${name}" was not provided.`);
    }
    return String(variables[name]);
  });
}

/** Variables referenced by a template body, for validation. */
export function templateVariables(text: string): string[] {
  return [
    ...new Set([...text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1])),
  ];
}

/** Render with sensitive values replaced, for the stored log copy. */
export function redact(
  definition: Pick<TemplateDefinition, 'sensitive'>,
  text: string,
  variables: Record<string, string | number>,
): string {
  const masked = { ...variables };
  for (const name of definition.sensitive ?? []) {
    if (name in masked) masked[name] = '••••••';
  }
  return renderTemplate(text, masked);
}

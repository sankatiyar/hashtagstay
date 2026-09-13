import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-sand text-ink ring-line',
  success: 'bg-brand-50 text-brand-700 ring-brand-200',
  warning: 'bg-peach-50 text-peach-700 ring-peach-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  muted: 'bg-white text-ink-soft ring-line',
};

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Listing lifecycle states, coloured by what they mean operationally. */
const LISTING_STATE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'muted' },
  submitted: { label: 'Submitted', tone: 'info' },
  in_verification: { label: 'In verification', tone: 'warning' },
  changes_requested: { label: 'Changes requested', tone: 'warning' },
  live: { label: 'Live', tone: 'success' },
  paused: { label: 'Paused', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'danger' },
  archived: { label: 'Archived', tone: 'muted' },
};

export function ListingStateBadge({ state }: { state: string }) {
  const meta = LISTING_STATE[state] ?? { label: state, tone: 'neutral' as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/**
 * Verification tiers, each with its definition in the tooltip.
 *
 * The tier is never rendered as a bare "Verified": that word implies we stand
 * behind the property, so what we actually checked has to travel with the
 * badge. Wording here is the customer-facing claim and needs legal review
 * before it appears on a public listing page.
 */
const VERIFICATION_TIER: Record<string, { label: string; tone: Tone; title: string }> =
  {
    none: {
      label: 'Unverified',
      tone: 'muted',
      title: 'No verification checks have been completed.',
    },
    documents_checked: {
      label: 'Documents checked',
      tone: 'info',
      title:
        'Ownership or lease proof and operator ID were reviewed by our team. The property itself has not been visited.',
    },
    photos_verified: {
      label: 'Photos verified',
      tone: 'info',
      title:
        'Documents reviewed, and the listing photos were confirmed to depict this property. The property has not been visited.',
    },
    onground_audited: {
      label: 'On-ground audited',
      tone: 'success',
      title:
        'Documents reviewed, photos confirmed, and a member of our team visited the property in person.',
    },
  };

/**
 * `expired` is passed in rather than derived from a date here. Reading the
 * clock during render is impure — the value would differ between the server
 * pass and a client re-render — so freshness is computed server-side in
 * `lib/services` via `lib/time`.
 */
export function VerificationBadge({
  tier,
  expired = false,
}: {
  tier: string;
  expired?: boolean;
}) {
  const meta =
    VERIFICATION_TIER[tier] ?? ({ label: tier, tone: 'neutral', title: '' } as const);

  // An expired verification must stop presenting as current — a 2026 audit
  // should not still read as a live assurance.
  if (expired) {
    return (
      <Badge
        tone="warning"
        title={`${meta.title} This check expired and needs renewal.`}
      >
        {meta.label} (expired)
      </Badge>
    );
  }

  return (
    <Badge tone={meta.tone} title={meta.title}>
      {meta.label}
    </Badge>
  );
}

const PROPERTY_TYPE: Record<string, string> = {
  pbsa: 'Student housing',
  coliving: 'Co-living',
  homeshare: 'Home sharing',
};

export const propertyTypeLabel = (type: string): string => PROPERTY_TYPE[type] ?? type;

const GENDER_POLICY: Record<string, string> = {
  any: 'Any gender',
  male_only: 'Men only',
  female_only: 'Women only',
  co_ed_segregated_floors: 'Co-ed, segregated floors',
};

export const genderPolicyLabel = (policy: string): string =>
  GENDER_POLICY[policy] ?? policy;

/**
 * Availability freshness. Availability is advisory, so how old a count is
 * matters as much as the number — an RM needs to know whether to re-confirm
 * with the host before promising a bed.
 */
export function FreshnessBadge({
  ageDays,
  confirmedOn,
}: {
  /** Whole days since availability was last confirmed; null if never. */
  ageDays: number | null;
  /** ISO date for the tooltip, e.g. "2026-09-12". */
  confirmedOn?: string | null;
}) {
  if (ageDays === null) {
    return (
      <Badge tone="danger" title="Availability has never been confirmed.">
        Never confirmed
      </Badge>
    );
  }

  const label = ageDays <= 0 ? 'Confirmed today' : `Confirmed ${ageDays}d ago`;
  const tone: Tone = ageDays <= 7 ? 'success' : ageDays <= 14 ? 'warning' : 'danger';

  return (
    <Badge
      tone={tone}
      title={`${confirmedOn ? `Last confirmed ${confirmedOn}. ` : ''}Availability is advisory — re-confirm with the operator before promising a bed.`}
    >
      {label}
    </Badge>
  );
}

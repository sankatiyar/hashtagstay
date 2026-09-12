/**
 * State machines for the four lifecycles the business actually runs on.
 *
 * These are declared as data, not as scattered `if` statements, for three
 * reasons:
 *
 *  1. An illegal transition becomes impossible rather than merely unlikely.
 *     "Booking jumped straight to confirmed without the host confirming" is a
 *     revenue-and-trust incident (build plan concern #4), not a typo.
 *  2. Every transition is enumerable, so the audit trail (§9) and the RM
 *     dashboard can be built from the same source of truth as the validation.
 *  3. Some transitions carry obligations — entering `lost` requires a reason,
 *     entering `fee_pending` requires the host to have confirmed. Encoding
 *     those next to the transition keeps them from being forgotten at one of
 *     the several call sites that can trigger it.
 */

export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
    reason?: string,
  ) {
    super(
      reason ??
        `Illegal ${machine} transition: ${from} -> ${to}. ` +
          `Allowed from ${from}: ${reason ?? 'see machine definition'}.`,
    );
    this.name = 'IllegalTransitionError';
  }
}

/**
 * A machine is a map of state -> the states reachable from it.
 *
 * `Record<S, ...>` is exhaustive: omitting a state from a machine definition is
 * a compile error, which is the property that stops a new state being added to
 * the union and silently having no transitions.
 */
export type Transitions<S extends string> = Readonly<Record<S, readonly S[]>>;

/**
 * The exported machine type indexes transitions by `string` rather than by `S`.
 *
 * That looks like a loss of precision but is deliberate: it makes `Machine<S>`
 * assignable to `Machine<string>`, so tooling that iterates every machine at
 * once (the invariant tests, an admin screen listing all workflows) does not
 * need a cast. Exhaustiveness is still enforced where it matters — at the
 * authoring site, by `defineMachine`'s parameter type below.
 */
export interface Machine<S extends string> {
  readonly name: string;
  readonly initial: S;
  readonly transitions: Readonly<Record<string, readonly S[]>>;
  /** States from which nothing further can happen. */
  readonly terminal: readonly S[];
}

export function defineMachine<S extends string>(machine: {
  readonly name: string;
  readonly initial: S;
  /** Exhaustive: every state in `S` must appear. */
  readonly transitions: Transitions<S>;
  readonly terminal: readonly S[];
}): Machine<S> {
  return machine;
}

export function canTransition<S extends string>(
  machine: Machine<S>,
  from: S,
  to: S,
): boolean {
  return machine.transitions[from]?.includes(to) ?? false;
}

export function allowedFrom<S extends string>(
  machine: Machine<S>,
  from: S,
): readonly S[] {
  return machine.transitions[from] ?? [];
}

export function isTerminal<S extends string>(machine: Machine<S>, state: S): boolean {
  return machine.terminal.includes(state);
}

/**
 * Throw unless the transition is legal. Call this in the write path of every
 * state change, before persisting.
 */
export function assertTransition<S extends string>(
  machine: Machine<S>,
  from: S,
  to: S,
): void {
  if (from === to) {
    throw new IllegalTransitionError(
      machine.name,
      from,
      to,
      `${machine.name} is already in state "${from}". A no-op transition is ` +
        'usually a double-submit or a retried webhook — handle it idempotently ' +
        'rather than re-applying the change.',
    );
  }
  if (isTerminal(machine, from)) {
    throw new IllegalTransitionError(
      machine.name,
      from,
      to,
      `${machine.name} state "${from}" is terminal; it cannot move to "${to}".`,
    );
  }
  if (!canTransition(machine, from, to)) {
    throw new IllegalTransitionError(
      machine.name,
      from,
      to,
      `Illegal ${machine.name} transition "${from}" -> "${to}". ` +
        `Allowed from "${from}": ${allowedFrom(machine, from).join(', ') || '(none)'}.`,
    );
  }
}

/** Every state reachable from `initial`, for wiring up dashboards and tests. */
export function reachableStates<S extends string>(machine: Machine<S>): Set<S> {
  const seen = new Set<S>([machine.initial]);
  const queue: S[] = [machine.initial];
  while (queue.length > 0) {
    const current = queue.shift() as S;
    for (const next of allowedFrom(machine, current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type ListingState =
  | 'draft'
  | 'submitted'
  | 'in_verification'
  | 'changes_requested'
  | 'live'
  | 'paused'
  | 'suspended'
  | 'archived';

/**
 * Note what is deliberately absent: `draft -> live`. A listing cannot reach
 * residents without passing through verification, because the verification
 * badge is the platform's core trust claim (PRD §10) and an unverified listing
 * going live is the failure that makes the badge meaningless.
 */
export const listingMachine = defineMachine<ListingState>({
  name: 'listing',
  initial: 'draft',
  terminal: ['archived'],
  transitions: {
    draft: ['submitted', 'archived'],
    submitted: ['in_verification', 'changes_requested', 'archived'],
    in_verification: ['live', 'changes_requested', 'suspended'],
    changes_requested: ['submitted', 'archived'],
    // Re-verification can be demanded of a live listing when its badge expires.
    live: ['paused', 'suspended', 'in_verification', 'archived'],
    paused: ['live', 'suspended', 'archived'],
    // Suspension is platform-initiated (a trust incident). Returning to live
    // requires re-verification, never a direct un-suspend.
    suspended: ['in_verification', 'archived'],
    archived: [],
  },
});

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

export type LeadState =
  | 'new'
  | 'assigned'
  | 'contacting'
  | 'qualified'
  | 'shortlist_shared'
  | 'negotiating'
  | 'booking_initiated'
  | 'won'
  | 'lost'
  | 'disqualified'
  | 'nurture';

/**
 * `disqualified` is reachable from the earliest states because bot and
 * competitor traffic is identified before anyone spends RM minutes on it
 * (build plan concern #8).
 *
 * `nurture` is reachable from most working states and can return to
 * `contacting`: a student whose intake is six months out is a real lead at the
 * wrong time, and dropping them as `lost` throws away the pipeline.
 */
export const leadMachine = defineMachine<LeadState>({
  name: 'lead',
  initial: 'new',
  terminal: ['won', 'disqualified'],
  transitions: {
    new: ['assigned', 'disqualified'],
    assigned: ['contacting', 'disqualified', 'lost', 'nurture'],
    contacting: ['qualified', 'lost', 'nurture', 'disqualified'],
    qualified: ['shortlist_shared', 'negotiating', 'lost', 'nurture'],
    shortlist_shared: ['negotiating', 'booking_initiated', 'lost', 'nurture'],
    negotiating: ['booking_initiated', 'shortlist_shared', 'lost', 'nurture'],
    // A failed booking returns the lead to the desk rather than killing it.
    booking_initiated: ['won', 'negotiating', 'lost'],
    won: [],
    // A lost lead can be revived — intake cycles come round again.
    lost: ['contacting', 'nurture'],
    disqualified: [],
    nurture: ['contacting', 'lost', 'disqualified'],
  },
});

/** Entering `lost` without a reason makes the §12 funnel analysis useless. */
export const LEAD_STATES_REQUIRING_REASON: readonly LeadState[] = ['lost'];

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export type BookingState =
  | 'initiated'
  | 'pending_host_confirmation'
  | 'fee_pending'
  | 'confirmed'
  | 'moved_in'
  | 'completed'
  | 'cancelled'
  | 'refunded';

/**
 * The critical property of this machine: **there is no path from `initiated` to
 * `fee_pending`**. Every booking must pass through
 * `pending_host_confirmation` first.
 *
 * Availability is advisory (small operators do not keep calendars current), so
 * charging a resident before the host has confirmed the bed is how an
 * aggregator sells a filled room. That is the single failure most likely to
 * destroy the trust the PRD positions as its differentiator, so the schema and
 * this machine both forbid it rather than relying on the UI to enforce order.
 */
export const bookingMachine = defineMachine<BookingState>({
  name: 'booking',
  initial: 'initiated',
  terminal: ['completed', 'refunded'],
  transitions: {
    initiated: ['pending_host_confirmation', 'cancelled'],
    pending_host_confirmation: ['fee_pending', 'cancelled'],
    fee_pending: ['confirmed', 'cancelled'],
    confirmed: ['moved_in', 'cancelled'],
    // Post-move-in cancellation is not a thing; disputes are tickets, and a
    // refund after move-in goes through the operator, not through us.
    moved_in: ['completed'],
    completed: [],
    // A cancelled booking that had a captured fee still owes a refund.
    cancelled: ['refunded'],
    refunded: [],
  },
});

/** Cancelling without a reason leaves the ops team unable to see the pattern. */
export const BOOKING_STATES_REQUIRING_REASON: readonly BookingState[] = ['cancelled'];

/**
 * States in which the resident's facilitation fee may legitimately be
 * collected. Checked by the payment path so a payment link cannot be created
 * for a booking the host has not confirmed.
 */
export const BOOKING_STATES_ALLOWING_PAYMENT: readonly BookingState[] = ['fee_pending'];

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type VerificationState =
  'pending' | 'docs_received' | 'in_review' | 'approved' | 'rejected' | 'expired';

/**
 * `approved -> expired` is the transition that makes the tiered badge honest:
 * a verification carries an expiry, and an expired one must stop displaying
 * rather than quietly implying current diligence (build plan concern #9).
 */
export const verificationMachine = defineMachine<VerificationState>({
  name: 'verification',
  initial: 'pending',
  terminal: [],
  transitions: {
    pending: ['docs_received', 'rejected'],
    docs_received: ['in_review', 'rejected'],
    in_review: ['approved', 'rejected', 'docs_received'],
    approved: ['expired', 'in_review'],
    // A rejection is not final: the operator can supply better documents.
    rejected: ['docs_received'],
    expired: ['docs_received', 'in_review'],
  },
});

export const machines = {
  listing: listingMachine,
  lead: leadMachine,
  booking: bookingMachine,
  verification: verificationMachine,
} as const;

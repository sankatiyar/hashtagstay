import { describe, expect, it } from 'vitest';

import {
  BOOKING_STATES_ALLOWING_PAYMENT,
  type BookingState,
  IllegalTransitionError,
  type LeadState,
  type ListingState,
  type Machine,
  allowedFrom,
  assertTransition,
  bookingMachine,
  canTransition,
  isTerminal,
  leadMachine,
  listingMachine,
  machines,
  reachableStates,
  verificationMachine,
} from './index';

/** Walk a path and assert every step is legal. */
function walk<S extends string>(machine: Machine<S>, path: readonly S[]): void {
  for (let i = 0; i < path.length - 1; i += 1) {
    assertTransition(machine, path[i], path[i + 1]);
  }
}

describe('machine invariants (all machines)', () => {
  // `Machine<S>` is assignable to `Machine<string>` by design, so the whole
  // registry can be iterated without per-machine casts.
  const entries: [string, Machine<string>][] = Object.entries(machines);

  for (const [key, machine] of entries) {
    describe(key, () => {
      it('declares a transition list for every state it can reach', () => {
        for (const state of reachableStates(machine)) {
          expect(
            allowedFrom(machine, state),
            `state "${state}" has no transitions entry`,
          ).toBeDefined();
        }
      });

      it('only names states that exist as keys', () => {
        const known = new Set(Object.keys(machine.transitions));
        for (const [from, targets] of Object.entries(machine.transitions)) {
          for (const to of targets as readonly string[]) {
            expect(known.has(to), `${from} -> ${to} targets an unknown state`).toBe(
              true,
            );
          }
        }
      });

      it('has no state that is both terminal and has outgoing transitions', () => {
        for (const state of machine.terminal) {
          expect(
            allowedFrom(machine, state),
            `terminal state "${state}" has outgoing transitions`,
          ).toHaveLength(0);
        }
      });

      it('reaches every declared state from the initial state', () => {
        // An unreachable state is dead code in the workflow — either a missing
        // transition or a state nobody actually uses.
        const reachable = reachableStates(machine);
        for (const state of Object.keys(machine.transitions)) {
          expect(reachable.has(state), `"${state}" is unreachable`).toBe(true);
        }
      });

      it('rejects a self-transition as a likely double-submit', () => {
        expect(() =>
          assertTransition(machine, machine.initial, machine.initial),
        ).toThrow(/already in state/);
      });
    });
  }
});

describe('booking machine — the host-confirmation gate', () => {
  it('CANNOT go straight from initiated to fee_pending', () => {
    // The single most important rule in the product: we never charge a resident
    // before the host has confirmed the bed is genuinely free.
    expect(canTransition(bookingMachine, 'initiated', 'fee_pending')).toBe(false);
    expect(() => assertTransition(bookingMachine, 'initiated', 'fee_pending')).toThrow(
      IllegalTransitionError,
    );
  });

  it('CANNOT go straight from initiated to confirmed', () => {
    expect(() => assertTransition(bookingMachine, 'initiated', 'confirmed')).toThrow(
      IllegalTransitionError,
    );
  });

  it('reaches fee_pending only via pending_host_confirmation', () => {
    const intoFeePending = (
      Object.entries(bookingMachine.transitions) as [BookingState, BookingState[]][]
    )
      .filter(([, targets]) => targets.includes('fee_pending'))
      .map(([from]) => from);

    expect(intoFeePending).toEqual(['pending_host_confirmation']);
  });

  it('allows payment only in fee_pending', () => {
    expect(BOOKING_STATES_ALLOWING_PAYMENT).toEqual(['fee_pending']);
  });

  it('walks the full happy path', () => {
    walk(bookingMachine, [
      'initiated',
      'pending_host_confirmation',
      'fee_pending',
      'confirmed',
      'moved_in',
      'completed',
    ]);
  });

  it('lets a cancelled booking be refunded, but not resurrected', () => {
    walk(bookingMachine, ['initiated', 'cancelled', 'refunded']);
    expect(() => assertTransition(bookingMachine, 'cancelled', 'confirmed')).toThrow();
  });

  it('treats completed and refunded as terminal', () => {
    expect(isTerminal(bookingMachine, 'completed')).toBe(true);
    expect(isTerminal(bookingMachine, 'refunded')).toBe(true);
    expect(() => assertTransition(bookingMachine, 'completed', 'cancelled')).toThrow(
      /terminal/,
    );
  });

  it('does not allow cancellation after move-in', () => {
    // A post-move-in problem is a support ticket or an operator-side refund,
    // not a booking cancellation on our books.
    expect(canTransition(bookingMachine, 'moved_in', 'cancelled')).toBe(false);
  });
});

describe('listing machine', () => {
  it('CANNOT publish a draft without verification', () => {
    expect(canTransition(listingMachine, 'draft', 'live')).toBe(false);
    expect(() => assertTransition(listingMachine, 'draft', 'live')).toThrow(
      IllegalTransitionError,
    );
  });

  it('reaches live only from in_verification or paused', () => {
    const intoLive = (
      Object.entries(listingMachine.transitions) as [ListingState, ListingState[]][]
    )
      .filter(([, targets]) => targets.includes('live'))
      .map(([from]) => from)
      .sort();

    expect(intoLive).toEqual(['in_verification', 'paused']);
  });

  it('requires re-verification to leave suspension, never a direct un-suspend', () => {
    expect(canTransition(listingMachine, 'suspended', 'live')).toBe(false);
    walk(listingMachine, ['suspended', 'in_verification', 'live']);
  });

  it('walks the onboarding happy path', () => {
    walk(listingMachine, ['draft', 'submitted', 'in_verification', 'live']);
  });

  it('supports a changes-requested loop', () => {
    walk(listingMachine, [
      'submitted',
      'changes_requested',
      'submitted',
      'in_verification',
      'live',
    ]);
  });
});

describe('lead machine', () => {
  it('disqualifies bot traffic before any RM time is spent', () => {
    walk(leadMachine, ['new', 'disqualified']);
    expect(isTerminal(leadMachine, 'disqualified')).toBe(true);
  });

  it('walks the full closure path from the PRD Journey A', () => {
    walk(leadMachine, [
      'new',
      'assigned',
      'contacting',
      'qualified',
      'shortlist_shared',
      'negotiating',
      'booking_initiated',
      'won',
    ]);
  });

  it('returns a failed booking to the desk rather than losing it', () => {
    walk(leadMachine, ['booking_initiated', 'negotiating', 'booking_initiated', 'won']);
  });

  it('can revive a lost lead — intake cycles come round again', () => {
    walk(leadMachine, ['lost', 'contacting', 'qualified']);
  });

  it('can park a too-early lead in nurture and bring it back', () => {
    walk(leadMachine, ['contacting', 'nurture', 'contacting']);
  });

  it('treats won as terminal', () => {
    expect(() => assertTransition(leadMachine, 'won', 'lost')).toThrow(/terminal/);
  });

  it('cannot skip from new straight to won', () => {
    const fromNew = allowedFrom(leadMachine, 'new') as readonly LeadState[];
    expect(fromNew).not.toContain('won');
  });
});

describe('verification machine', () => {
  it('expires an approved verification so a stale badge stops showing', () => {
    walk(verificationMachine, ['approved', 'expired']);
  });

  it('lets an expired verification be renewed', () => {
    walk(verificationMachine, ['expired', 'docs_received', 'in_review', 'approved']);
  });

  it('lets a rejection be reworked rather than being final', () => {
    walk(verificationMachine, ['rejected', 'docs_received', 'in_review', 'approved']);
  });

  it('cannot approve straight from pending without documents', () => {
    expect(canTransition(verificationMachine, 'pending', 'approved')).toBe(false);
  });
});

describe('error messages', () => {
  it('names the allowed transitions so the fix is obvious', () => {
    try {
      assertTransition(bookingMachine, 'initiated', 'confirmed');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalTransitionError);
      const message = (error as Error).message;
      expect(message).toContain('initiated');
      expect(message).toContain('confirmed');
      expect(message).toContain('pending_host_confirmation');
    }
  });
});

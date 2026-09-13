import { describe, expect, it } from 'vitest';

import {
  firstCallDueAt,
  isDeskOpen,
  nextDeskOpening,
  responsePromise,
  slaStatus,
} from './sla';

/** Build a UTC instant from an IST wall-clock time. */
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('desk hours (IST 09:00–21:00)', () => {
  it('is open mid-morning and closed late at night', () => {
    expect(isDeskOpen(ist('2026-09-14T10:30:00'))).toBe(true);
    expect(isDeskOpen(ist('2026-09-14T23:00:00'))).toBe(false);
    expect(isDeskOpen(ist('2026-09-14T08:59:00'))).toBe(false);
  });

  it('treats the closing hour as closed', () => {
    expect(isDeskOpen(ist('2026-09-14T20:59:00'))).toBe(true);
    expect(isDeskOpen(ist('2026-09-14T21:00:00'))).toBe(false);
  });

  it('opens later the same day for an early-morning lead', () => {
    expect(nextDeskOpening(ist('2026-09-14T06:00:00')).toISOString()).toBe(
      ist('2026-09-14T09:00:00').toISOString(),
    );
  });

  it('opens the next day for a late-night lead', () => {
    expect(nextDeskOpening(ist('2026-09-14T22:15:00')).toISOString()).toBe(
      ist('2026-09-15T09:00:00').toISOString(),
    );
  });

  it('handles a lead just after midnight IST, which is still the previous UTC day', () => {
    // 00:30 IST on the 15th is 19:00 UTC on the 14th.
    expect(nextDeskOpening(ist('2026-09-15T00:30:00')).toISOString()).toBe(
      ist('2026-09-15T09:00:00').toISOString(),
    );
  });
});

describe('firstCallDueAt()', () => {
  it('is five minutes after creation during desk hours', () => {
    expect(firstCallDueAt(ist('2026-09-14T11:00:00')).toISOString()).toBe(
      ist('2026-09-14T11:05:00').toISOString(),
    );
  });

  it('is five minutes after opening outside desk hours', () => {
    expect(firstCallDueAt(ist('2026-09-14T02:00:00')).toISOString()).toBe(
      ist('2026-09-14T09:05:00').toISOString(),
    );
  });
});

describe('slaStatus()', () => {
  const due = ist('2026-09-14T11:05:00');

  it('is met when the first call came before the deadline', () => {
    expect(
      slaStatus({ dueAt: due, firstCallAttemptedAt: ist('2026-09-14T11:03:00') }),
    ).toBe('met');
  });

  it('is breached when the first call came late', () => {
    expect(
      slaStatus({ dueAt: due, firstCallAttemptedAt: ist('2026-09-14T11:20:00') }),
    ).toBe('breached');
  });

  it('is breached when no call has happened and the deadline passed', () => {
    expect(
      slaStatus({
        dueAt: due,
        firstCallAttemptedAt: null,
        now: ist('2026-09-14T11:06:00'),
      }),
    ).toBe('breached');
  });

  it('warns shortly before the deadline', () => {
    expect(
      slaStatus({
        dueAt: due,
        firstCallAttemptedAt: null,
        now: ist('2026-09-14T11:04:00'),
      }),
    ).toBe('due_soon');
  });

  it('is on track well before', () => {
    expect(
      slaStatus({
        dueAt: due,
        firstCallAttemptedAt: null,
        now: ist('2026-09-14T11:00:30'),
      }),
    ).toBe('on_track');
  });
});

describe('responsePromise()', () => {
  it('promises minutes only while the desk is open', () => {
    expect(responsePromise(ist('2026-09-14T11:00:00'))).toBe('within 5 minutes');
  });

  it('never promises minutes at night', () => {
    const late = responsePromise(ist('2026-09-14T23:30:00'));
    expect(late).not.toMatch(/minutes/);
    expect(late).toMatch(/tomorrow/);
  });

  it('says today for an early-morning lead', () => {
    expect(responsePromise(ist('2026-09-14T07:00:00'))).toMatch(/9am today/);
  });
});

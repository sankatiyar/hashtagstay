/**
 * Desk hours and first-response SLA (FR-13).
 *
 * The PRD's five-minute target is a staffing commitment: software can only
 * measure it and escalate. So the SLA clock runs in desk hours. A lead arriving
 * at 2am is due five minutes after the desk opens, and the resident is told
 * that honestly in the acknowledgement rather than promised a call that will
 * not come.
 *
 * All calculation is in IST, which has no daylight saving, so a fixed +05:30
 * offset is exact.
 */

export const IST_OFFSET_MINUTES = 330;

export interface DeskHours {
  /** Opening hour in IST, 0–23. */
  openHour: number;
  /** Closing hour in IST, exclusive, 1–24. */
  closeHour: number;
  /** Minutes allowed for the first call attempt once the desk is open. */
  firstCallMinutes: number;
  /** Warn this many minutes before the deadline. */
  warningMinutes: number;
}

export const DEFAULT_DESK_HOURS: DeskHours = {
  openHour: 9,
  closeHour: 21,
  firstCallMinutes: 5,
  warningMinutes: 2,
};

const MS_PER_MINUTE = 60_000;

/** The IST wall-clock hour and minute for an instant. */
function istParts(instant: Date): { hour: number; minute: number } {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

/** UTC instant for a given IST calendar day (taken from `reference`) at `hour`:00. */
function istAt(reference: Date, hour: number, dayOffset = 0): Date {
  const shifted = new Date(reference.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  const utcMidnightOfIstDay = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + dayOffset,
    hour,
    0,
    0,
  );
  return new Date(utcMidnightOfIstDay - IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function isDeskOpen(
  instant: Date,
  hours: DeskHours = DEFAULT_DESK_HOURS,
): boolean {
  const { hour } = istParts(instant);
  return hour >= hours.openHour && hour < hours.closeHour;
}

/** When the desk next opens at or after `instant`. */
export function nextDeskOpening(
  instant: Date,
  hours: DeskHours = DEFAULT_DESK_HOURS,
): Date {
  if (isDeskOpen(instant, hours)) return instant;
  const { hour } = istParts(instant);
  return hour < hours.openHour
    ? istAt(instant, hours.openHour, 0)
    : istAt(instant, hours.openHour, 1);
}

/** First-call deadline for a lead created at `createdAt`. */
export function firstCallDueAt(
  createdAt: Date,
  hours: DeskHours = DEFAULT_DESK_HOURS,
): Date {
  const start = nextDeskOpening(createdAt, hours);
  return new Date(start.getTime() + hours.firstCallMinutes * MS_PER_MINUTE);
}

export type SlaStatus = 'met' | 'on_track' | 'due_soon' | 'breached';

export function slaStatus(params: {
  dueAt: Date | null;
  firstCallAttemptedAt: Date | null;
  now?: Date;
  hours?: DeskHours;
}): SlaStatus {
  const { dueAt, firstCallAttemptedAt } = params;
  const now = params.now ?? new Date();
  const hours = params.hours ?? DEFAULT_DESK_HOURS;
  if (!dueAt) return 'on_track';

  if (firstCallAttemptedAt) {
    return firstCallAttemptedAt.getTime() <= dueAt.getTime() ? 'met' : 'breached';
  }
  if (now.getTime() > dueAt.getTime()) return 'breached';
  if (dueAt.getTime() - now.getTime() <= hours.warningMinutes * MS_PER_MINUTE) {
    return 'due_soon';
  }
  return 'on_track';
}

/**
 * Plain-language promise for the acknowledgement message. Never "within 5
 * minutes" outside desk hours — that is the broken promise this module exists
 * to avoid.
 */
export function responsePromise(
  createdAt: Date,
  hours: DeskHours = DEFAULT_DESK_HOURS,
): string {
  if (isDeskOpen(createdAt, hours)) {
    return `within ${hours.firstCallMinutes} minutes`;
  }
  const opens = nextDeskOpening(createdAt, hours);
  const sameIstDay = istAt(createdAt, 0).getTime() === istAt(opens, 0).getTime();
  const openLabel = `${hours.openHour > 12 ? hours.openHour - 12 : hours.openHour}${hours.openHour >= 12 ? 'pm' : 'am'}`;
  return sameIstDay
    ? `soon after our desk opens at ${openLabel} today`
    : `soon after our desk opens at ${openLabel} tomorrow`;
}

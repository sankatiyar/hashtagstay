'use client';

import { useActionState, useState } from 'react';

import {
  type Checklist,
  type ChecklistOutcome,
  RUBRIC,
  TIER_LABELS,
  type VerificationTier,
  canGrant,
  evaluateTier,
  itemsIntroducedAt,
} from '@/lib/verification/rubric';

import {
  type VerifyState,
  approveVerificationAction,
  rejectVerificationAction,
  saveChecklistAction,
} from './actions';

const initial: VerifyState = {};

const TIERS: Exclude<VerificationTier, 'none'>[] = [
  'documents_checked',
  'photos_verified',
  'onground_audited',
];

const OUTCOME_LABELS: Record<ChecklistOutcome, string> = {
  pass: 'Pass',
  fail: 'Fail',
  not_applicable: 'N/A',
};

export function ReviewForm({
  propertyId,
  verificationId,
  initialChecklist,
  canReview,
  canApprove,
  blockedReason,
}: {
  propertyId: string;
  verificationId: string;
  initialChecklist: Checklist;
  /**
   * Whether the viewer may record checklist outcomes at all. Ops can read the
   * screen to see what is outstanding, but filling in the checks is the
   * reviewer's work — offering editable controls that the server then refuses
   * would be worse than showing them read-only.
   */
  canReview: boolean;
  canApprove: boolean;
  /** Set when the viewer may not decide this one, e.g. they submitted it. */
  blockedReason?: string;
}) {
  const [saveState, saveAction, saving] = useActionState(saveChecklistAction, initial);
  const [approveState, approveAction, approving] = useActionState(
    approveVerificationAction,
    initial,
  );
  const [rejectState, rejectAction, rejecting] = useActionState(
    rejectVerificationAction,
    initial,
  );

  /**
   * Checklist lives in client state so the tier readout updates as the reviewer
   * works. The server re-evaluates the rubric on submit regardless — this is a
   * preview, never the authority.
   */
  const [checklist, setChecklist] = useState<Checklist>(initialChecklist);
  const [tier, setTier] =
    useState<Exclude<VerificationTier, 'none'>>('documents_checked');

  const supported = evaluateTier(checklist);
  const grant = canGrant(tier, checklist);
  const message =
    approveState.error ??
    rejectState.error ??
    saveState.error ??
    approveState.ok ??
    rejectState.ok ??
    saveState.ok;
  const isError = Boolean(approveState.error ?? rejectState.error ?? saveState.error);
  const busy = saving || approving || rejecting;

  const setOutcome = (key: string, outcome: ChecklistOutcome) =>
    setChecklist((prev) => ({ ...prev, [key]: outcome }));

  return (
    <form className="space-y-6">
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="verificationId" value={verificationId} />

      {/* The controlled checklist has to reach the server as form fields. */}
      {RUBRIC.map((item) => (
        <input
          key={`hidden-${item.key}`}
          type="hidden"
          name={`item.${item.key}`}
          value={checklist[item.key] ?? ''}
        />
      ))}
      <input type="hidden" name="tier" value={tier} />

      {message && (
        <p
          role="alert"
          aria-live="polite"
          className={`rounded-lg px-4 py-3 text-sm ${
            isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {message}
        </p>
      )}

      {blockedReason && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {blockedReason}
        </p>
      )}

      {TIERS.map((tierKey) => {
        const items = itemsIntroducedAt(tierKey);
        return (
          <section
            key={tierKey}
            className="rounded-xl border border-slate-200 bg-white"
          >
            <header className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {TIER_LABELS[tierKey]}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Required to grant {TIER_LABELS[tierKey].toLowerCase()} or higher.
              </p>
            </header>

            <ul className="divide-y divide-slate-100">
              {items.map((item) => {
                const current = checklist[item.key];
                return (
                  <li key={item.key} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-xl">
                        <p className="text-sm font-medium text-slate-900">
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {item.guidance}
                        </p>
                      </div>

                      <fieldset
                        className="flex gap-1"
                        aria-label={`Outcome for ${item.label}`}
                      >
                        {(['pass', 'fail', 'not_applicable'] as const)
                          .filter(
                            (o) => o !== 'not_applicable' || item.allowNotApplicable,
                          )
                          .map((outcome) => {
                            const active = current === outcome;
                            return (
                              <button
                                key={outcome}
                                type="button"
                                aria-pressed={active}
                                disabled={!canReview}
                                onClick={() => setOutcome(item.key, outcome)}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  active
                                    ? outcome === 'pass'
                                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                      : outcome === 'fail'
                                        ? 'border-red-400 bg-red-50 text-red-700'
                                        : 'border-slate-400 bg-slate-100 text-slate-700'
                                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {OUTCOME_LABELS[outcome]}
                              </button>
                            );
                          })}
                      </fieldset>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Decision</h2>
        <p className="mt-1 text-xs text-slate-500">
          The checklist decides the tier, not confidence. Highest tier currently
          supported: <strong>{TIER_LABELS[supported]}</strong>.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="tier-select"
              className="block text-xs font-medium text-slate-600"
            >
              Grant tier
            </label>
            <select
              id="tier-select"
              value={tier}
              onChange={(event) =>
                setTier(event.target.value as Exclude<VerificationTier, 'none'>)
              }
              className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {!grant.ok && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">
                Not yet grantable at {TIER_LABELS[tier].toLowerCase()}:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {grant.missing.map((item) => (
                  <li key={item.key}>{item.label}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="note" className="block text-xs font-medium text-slate-600">
              Decision note
            </label>
            <textarea
              id="note"
              name="note"
              rows={2}
              placeholder="Recorded on the verification and in the audit trail. Required when sending back."
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              formAction={saveAction}
              disabled={busy || !canReview}
              title={
                canReview ? undefined : 'Recording checks needs the verifier role.'
              }
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save progress'}
            </button>

            <button
              type="submit"
              formAction={approveAction}
              disabled={busy || !canApprove || !grant.ok}
              title={
                !canApprove
                  ? (blockedReason ?? 'Approving requires the verifier role.')
                  : !grant.ok
                    ? 'The checklist does not yet support this tier.'
                    : undefined
              }
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approving ? 'Approving…' : 'Approve and publish'}
            </button>

            <button
              type="submit"
              formAction={rejectAction}
              disabled={busy || !canApprove}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {rejecting ? 'Sending…' : 'Send back for changes'}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}

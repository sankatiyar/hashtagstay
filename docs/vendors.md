# Vendor procurement — the real critical path

Every credential below gates a milestone. None of them can be rushed with code,
and three have multi-week external approval steps. **Start all of them in week 1**
(build plan concern #10) or M3 and M4 slip regardless of engineering progress.

When a credential is missing, the feature that needs it throws a named error via
`requireVendor()` in `src/lib/env.ts` rather than failing obscurely. The app
builds and runs without any of them.

| Vendor | Gates | Lead time | Blocking step |
|---|---|---|---|
| Supabase | everything | done | — |
| Razorpay | M4 fee collection | 3–10 business days | Business KYC + bank verification |
| Exotel / Ozonetel | M3 RM desk | 1–3 weeks | KYC, then virtual number provisioning |
| WhatsApp BSP | M2 auto-ack, M4 confirmations | **2–5 weeks** | Meta Business verification, then per-template approval |
| MSG91 (SMS/OTP) | M2 enquiry OTP | 1–2 weeks | TRAI **DLT** registration + template approval |
| Resend / SES | M4 confirmations | hours–2 days | Domain DNS (SPF/DKIM) |
| Inngest | M3 SLA timers | minutes | — |
| Sentry | M0 | minutes | — |

## The three that will actually hurt

### 1. WhatsApp Business API — longest pole

Two sequential approvals, not one:

1. **Meta Business verification** for the legal entity (certificate of
   incorporation, proof of address, a verifiable public phone/website).
2. **Per-template approval** for every proactive message. Utility templates
   clear in hours; anything Meta reads as marketing gets rejected.

Consequences for the build:

- The sub-60-second lead acknowledgement (the *real* guarantee behind the PRD's
  5-minute SLA) is a WhatsApp template. Submit it first.
- You cannot send a free-form WhatsApp message outside a 24-hour customer
  service window. Every proactive touch must be a pre-approved template — so
  template copy is a **product decision with a lead time**, not a late detail.
- Templates live in `notification_templates` with `providerTemplateName` and
  `approvalState` mirroring Meta's state, so we never attempt an unapproved send.

### 2. Telephony — and why masking is non-negotiable

Required capabilities, in priority order:

1. **Number masking.** Both legs connect to a virtual number; neither party ever
   sees the other's real number. This is revenue protection, not privacy
   garnish: the moment a host's number reaches a resident, the booking can
   happen off-platform and we earn nothing (build plan concern #1). With
   fee-only money flow we have no payment chokepoint to fall back on.
2. Click-to-call from the RM workspace (FR-12).
3. Call recording with a **consent announcement** on the leg — recording without
   disclosed consent is not lawful, and `calls.recordingConsentCaptured` records
   that the announcement actually played.
4. Webhooks for call lifecycle, so dispositions and durations are not typed by hand.

Ask both vendors to confirm masking and recording-announcement support in
writing before signing; pricing is secondary.

### 3. SMS/OTP — DLT is a hard gate

India requires TRAI **DLT** (Distributed Ledger Technology) registration before
any transactional SMS will deliver: register the entity, the sender ID, and each
template. Unregistered traffic is silently dropped by carriers — it looks like a
code bug, not a compliance block.

Phone OTP gates the enquiry form (build plan concern #8), so this blocks M2.

## Payments scope — keep it narrow deliberately

Phase 1 collects **only the facilitation fee** from the resident. Rent and
deposit are paid resident → host off-platform, and host commission is invoiced
monthly on a statement (`host_statements`).

This is a deliberate regulatory choice. Collecting rent and remitting it to
hosts would make us an intermediary handling third-party funds, pulling in RBI
payment-aggregator obligations, escrow/nodal arrangements, host bank KYC and a
payout ledger. Razorpay **Route** is the migration path if that changes — but it
is a separate legal decision, not a config flag.

## Also needed before M4, and not a vendor

- **Our GSTIN and place-of-supply state code** (`COMPANY_GSTIN`,
  `COMPANY_STATE_CODE`). Charging an Indian resident a fee obliges us to issue a
  compliant tax invoice with a gapless serial series per financial year. Invoice
  numbering cannot be retrofitted — see `tax_documents`.
- **A reviewed privacy notice**, versioned. `PRIVACY_POLICY_VERSION` is stamped
  onto every consent record so a later policy change cannot retroactively claim
  consent under terms the person never saw.
- **Legal sign-off on verification tier wording.** "Verified" implies we stand
  behind the property; each tier's on-listing definition needs review
  (build plan concern #9).

## Secrets hygiene

- `.env.local` is gitignored. Never commit it; never paste its contents into
  chat or a ticket.
- The Supabase **publishable** key is public by design (protected by Row Level
  Security). The **secret / service_role** key bypasses RLS — server-only, and
  never prefixed `NEXT_PUBLIC_`.
- The `AUTH_SECRET` generated during local setup is for development. Generate a
  fresh one per environment and store it in that environment's secret manager.

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthenticatedUser } from '@/lib/auth/session';
import { captureTestPayment } from '@/lib/services/payments';
import {
  confirmHostAvailability,
  createBooking,
  listBookings,
  requestHostConfirmation,
  sendPaymentLink,
} from '@/lib/services/bookings';
import {
  assertBookingInOrg,
  hostPerformance,
  HostScopeError,
} from '@/lib/services/host-portal';
import { assignLead, createEnquiry, transitionLead } from '@/lib/services/leads';
import { createShortlist, shareShortlist } from '@/lib/services/shortlists';
import { generateStatements, statementLines } from '@/lib/services/statements';

/**
 * PRD Journey A end to end, against a real database: enquiry → shortlist →
 * booking → operator confirmation → fee payment → GST invoice → host statement.
 *
 * Unit tests cover each state machine in isolation; this proves the services
 * hand off to each other, and that the one rule the business depends on holds:
 * a resident is never asked to pay before the operator confirms the bed.
 */

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
const client = postgres(url!, { max: 1, prepare: false, onnotice: () => {} });

const SUFFIX = `jny-${Date.now()}`;
const ACTOR = { id: null, label: `integration-test-${SUFFIX}` };
// A fresh number per run, so the 30-day enquiry de-duplication never merges runs.
const PHONE = `+919${String(Date.now()).slice(-9)}`;

let orgId: string;
let otherOrgId: string;
let propertyId: string;
let roomTypeId: string;
let staff: AuthenticatedUser;
let hostUserId: string;

let leadId: string;
let bookingId: string;
let paymentToken: string;

async function cleanup() {
  const orgs = await client<
    { id: string }[]
  >`SELECT id FROM organizations WHERE slug LIKE ${'%' + SUFFIX}`;
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length > 0) {
    const statementDocs = await client<{ tax_document_id: string | null }[]>`
      DELETE FROM host_statements WHERE organization_id IN ${client(orgIds)} RETURNING tax_document_id
    `;
    await client`
      DELETE FROM tax_documents
      WHERE booking_id IN (SELECT id FROM bookings WHERE organization_id IN ${client(orgIds)})
         OR id IN ${client(
           statementDocs
             .map((s) => s.tax_document_id)
             .filter(Boolean)
             .concat(['00000000-0000-0000-0000-000000000000']) as string[],
         )}
    `;
    await client`DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE organization_id IN ${client(orgIds)})`;
    await client`DELETE FROM bookings WHERE organization_id IN ${client(orgIds)}`;
    await client`
      DELETE FROM shortlist_items
      WHERE property_id IN (SELECT id FROM properties WHERE organization_id IN ${client(orgIds)})
    `;
  }
  await client`DELETE FROM leads WHERE contact_phone = ${PHONE}`;
  if (orgIds.length > 0) {
    await client`DELETE FROM properties WHERE organization_id IN ${client(orgIds)}`;
    await client`DELETE FROM organizations WHERE id IN ${client(orgIds)}`;
  }
  await client`DELETE FROM users WHERE email LIKE ${'%' + SUFFIX + '@example.test'}`;
  await client`DELETE FROM audit_log WHERE actor_label = ${ACTOR.label}`;
}

beforeAll(async () => {
  await cleanup();

  const [org] = await client<{ id: string }[]>`
    INSERT INTO organizations (name, slug, commission_rate_bps)
    VALUES ('Journey Operator', ${'org-' + SUFFIX}, 800) RETURNING id
  `;
  orgId = org.id;
  const [other] = await client<{ id: string }[]>`
    INSERT INTO organizations (name, slug) VALUES ('Unrelated Operator', ${'other-' + SUFFIX}) RETURNING id
  `;
  otherOrgId = other.id;

  // Fee rules scoped to this test's operator, at a priority above any global
  // default. The CI migrations job runs against an unseeded database, and a
  // booking cannot be created without a facilitation fee rule. They cascade
  // away with the organization.
  await client`
    INSERT INTO fee_rules (kind, payer, basis, flat_amount_minor, flat_currency, rate_bps, tax_rate_bps, organization_id, priority)
    VALUES
      ('facilitation_fee', 'resident', 'flat', 9900, 'INR', NULL, 1800, ${orgId}, 100),
      ('renting_commission', 'host', 'percent_of_monthly_rent', NULL, NULL, 800, 1800, ${orgId}, 100)
  `;

  const [property] = await client<{ id: string }[]>`
    INSERT INTO properties
      (organization_id, name, slug, property_type, address_line1, locality, city, state,
       listing_state, verification_tier, location)
    VALUES
      (${orgId}, 'Journey House', ${'journey-' + SUFFIX}, 'coliving', '5 Journey Road',
       'Koramangala', 'Bengaluru', 'Karnataka', 'live', 'documents_checked',
       ST_SetSRID(ST_MakePoint(77.6245, 12.9352), 4326))
    RETURNING id
  `;
  propertyId = property.id;

  const [room] = await client<{ id: string }[]>`
    INSERT INTO room_types (property_id, name, occupancy, rent_amount_minor, rent_currency, deposit_amount_minor, min_tenure_months)
    VALUES (${propertyId}, 'Single', 1, 1800000, 'INR', 3600000, 3)
    RETURNING id
  `;
  roomTypeId = room.id;

  const [staffRow] = await client<{ id: string }[]>`
    INSERT INTO users (audience, email, full_name)
    VALUES ('staff', ${'rm-' + SUFFIX + '@example.test'}, 'Journey RM') RETURNING id
  `;
  staff = {
    id: staffRow.id,
    audience: 'staff',
    email: `rm-${SUFFIX}@example.test`,
    phone: null,
    fullName: 'Journey RM',
    roles: ['super_admin'],
    sessionId: 'test',
    mfaSatisfied: true,
  };

  const [hostRow] = await client<{ id: string }[]>`
    INSERT INTO users (audience, email, full_name)
    VALUES ('host', ${'host-' + SUFFIX + '@example.test'}, 'Journey Host') RETURNING id
  `;
  hostUserId = hostRow.id;
});

afterAll(async () => {
  await cleanup();
  await client.end({ timeout: 5 });
});

describe('Journey A: enquiry to confirmed booking', () => {
  it('captures an enquiry with its attribution intact', async () => {
    const result = await createEnquiry({
      name: 'Asha Journey',
      phone: PHONE,
      phoneVerified: true,
      email: `asha-${SUFFIX}@example.test`,
      city: 'Bengaluru',
      budgetMaxRupees: 20000,
      moveInDate: new Date(Date.now() + 14 * 86_400_000),
      tenureMonths: 6,
      listingSlug: `journey-${SUFFIX}`,
      attribution: {
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'blr-coliving',
        gclid: 'test-gclid',
      },
    });
    leadId = result.leadId;
    expect(result.merged).toBe(false);

    const [lead] = await client<{ utm_source: string; gclid: string; state: string }[]>`
      SELECT utm_source, gclid, state FROM leads WHERE id = ${leadId}
    `;
    expect(lead.utm_source).toBe('google');
    expect(lead.gclid).toBe('test-gclid');
  });

  it('acknowledges the enquiry automatically', async () => {
    const rows = await client`SELECT 1 FROM notifications WHERE lead_id = ${leadId}`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('builds and shares a shortlist after the call, qualifying the lead on the way', async () => {
    // What the desk does: the lead is assigned, the RM calls, then sends options.
    await assignLead(leadId, staff.id, staff, ACTOR);
    await transitionLead(leadId, 'contacting', staff, ACTOR);

    const { shortlistId, publicToken } = await createShortlist(
      leadId,
      { items: [{ propertyId, roomTypeId, rmNote: 'Walkable to your office' }] },
      staff,
      ACTOR,
    );
    expect(publicToken.length).toBeGreaterThan(16);
    const shared = await shareShortlist(shortlistId, staff, ACTOR);
    expect(shared.url).toContain(`/s/${publicToken}`);

    const [lead] = await client<
      { state: string }[]
    >`SELECT state FROM leads WHERE id = ${leadId}`;
    expect(lead.state).toBe('shortlist_shared');
  });

  it('creates a booking with the fees snapshotted', async () => {
    const created = await createBooking(
      leadId,
      {
        propertyId,
        roomTypeId,
        moveInDate: new Date(Date.now() + 14 * 86_400_000),
        tenureMonths: 6,
      },
      staff,
      ACTOR,
    );
    bookingId = created.bookingId;

    const [booking] = await client<
      {
        state: string;
        facilitation_fee_amount_minor: number | null;
        host_commission_amount_minor: number | null;
      }[]
    >`SELECT state, facilitation_fee_amount_minor, host_commission_amount_minor FROM bookings WHERE id = ${bookingId}`;
    expect(booking.state).toBe('initiated');
    // bigint columns come back from postgres.js as strings.
    expect(Number(booking.facilitation_fee_amount_minor)).toBeGreaterThan(0);
    expect(Number(booking.host_commission_amount_minor)).toBeGreaterThan(0);
  });

  it('refuses to charge the resident before the operator confirms', async () => {
    await expect(sendPaymentLink(bookingId, staff, ACTOR)).rejects.toThrow(
      /not confirmed the bed/,
    );
    await requestHostConfirmation(bookingId, staff, ACTOR);
    await expect(sendPaymentLink(bookingId, staff, ACTOR)).rejects.toThrow(
      /not confirmed the bed/,
    );
  });

  it('lets only the owning organization act on the booking', async () => {
    await expect(assertBookingInOrg(bookingId, otherOrgId)).rejects.toThrow(
      HostScopeError,
    );
    await expect(assertBookingInOrg(bookingId, orgId)).resolves.toBeUndefined();
    const others = await listBookings({ organizationId: otherOrgId, state: 'all' });
    expect(others.some((b) => b.id === bookingId)).toBe(false);
  });

  it('moves to fee_pending when the host confirms in the portal', async () => {
    await confirmHostAvailability(
      bookingId,
      { confirmedByUserId: hostUserId, via: 'host_portal' },
      ACTOR,
    );
    const [booking] = await client<
      { state: string }[]
    >`SELECT state FROM bookings WHERE id = ${bookingId}`;
    expect(booking.state).toBe('fee_pending');
  });

  it('sends a payment link for the fee plus GST', async () => {
    const link = await sendPaymentLink(bookingId, staff, ACTOR);
    expect(link.url).toMatch(/\/pay\//);

    const [payment] = await client<
      {
        state: string;
        public_token: string;
        gross_amount_minor: number;
        tax_amount_minor: number;
      }[]
    >`SELECT state, public_token, gross_amount_minor, tax_amount_minor FROM payments WHERE booking_id = ${bookingId}`;
    expect(payment.state).toBe('pending');
    expect(Number(payment.tax_amount_minor)).toBeGreaterThan(0);
    paymentToken = payment.public_token;
  });

  it('confirms the booking and issues exactly one invoice on capture, even if captured twice', async () => {
    await captureTestPayment(paymentToken);
    await captureTestPayment(paymentToken);

    const [booking] = await client<
      { state: string }[]
    >`SELECT state FROM bookings WHERE id = ${bookingId}`;
    expect(booking.state).toBe('confirmed');

    const invoices = await client<{ document_number: string }[]>`
      SELECT document_number FROM tax_documents WHERE booking_id = ${bookingId}
    `;
    expect(invoices).toHaveLength(1);

    const [lead] = await client<
      { state: string }[]
    >`SELECT state FROM leads WHERE id = ${leadId}`;
    expect(lead.state).toBe('won');
  });

  it('shows up in the host dashboard numbers', async () => {
    const performance = await hostPerformance(orgId);
    const row = performance.find((p) => p.propertyId === propertyId);
    expect(row?.shortlisted).toBe(1);
    expect(row?.confirmed).toBe(1);
  });

  it('lands on the host commission statement for the month', async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 86_400_000);
    const periodEnd = new Date(now.getTime() + 86_400_000);
    const results = await generateStatements({ periodStart, periodEnd, issue: false });
    const ours = results.find((r) => r.organizationId === orgId);
    expect(ours?.bookings).toBe(1);

    const lines = await statementLines(orgId, periodStart, periodEnd);
    expect(lines).toHaveLength(1);
    expect(lines[0].hostCommissionAmountMinor).toBe(ours?.commissionMinor);
  });
});

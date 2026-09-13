'use server';

import { cookies, headers } from 'next/headers';

import { ATTRIBUTION_COOKIE, type AttributionInput } from '@/lib/attribution';
import { findOrCreateResident, signInResident } from '@/lib/auth/resident';
import { clientEnv } from '@/lib/env';
import { LeadError, createEnquiry } from '@/lib/services/leads';
import { requestOtp, verifyOtp } from '@/lib/services/otp';
import {
  enquiryErrors,
  enquirySchema,
  readEnquiryForm,
} from '@/lib/validation/enquiry';

export interface EnquiryState {
  step: 'details' | 'verify' | 'done';
  values: Record<string, string>;
  errors?: Record<string, string>;
  /** Development only: the OTP, since SMS is not configured locally. */
  devCode?: string;
  destination?: string;
  reference?: string;
  responsePromise?: string;
  merged?: boolean;
}

async function readAttribution(): Promise<AttributionInput> {
  const jar = await cookies();
  const raw = jar.get(ATTRIBUTION_COOKIE)?.value;
  if (raw) {
    try {
      return JSON.parse(decodeURIComponent(raw)) as AttributionInput;
    } catch {
      // A malformed cookie is ignored rather than failing the enquiry.
    }
  }
  const h = await headers();
  return { referrerUrl: h.get('referer'), landingPagePath: '/enquiry' };
}

/**
 * One action, routed by `intent`, so the form has a single source of state:
 *  - `send`   validate details and text a code
 *  - `resend` text a fresh code
 *  - `verify` check the code and create the lead
 */
export async function enquiryAction(
  _previous: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const intent = String(formData.get('intent') ?? 'send');
  const values = readEnquiryForm(formData);
  const parsed = enquirySchema.safeParse(values);
  if (!parsed.success) {
    return { step: 'details', values, errors: enquiryErrors(parsed.error) };
  }
  const data = parsed.data;

  if (intent === 'send' || intent === 'resend') {
    const result = await requestOtp({ phone: data.phone, purpose: 'enquiry' });
    if (!result.ok) {
      return {
        step:
          intent === 'resend' || result.reason === 'cooldown' ? 'verify' : 'details',
        values,
        destination: data.phone,
        errors: { [intent === 'resend' ? 'code' : 'phone']: result.message },
      };
    }
    return {
      step: 'verify',
      values,
      devCode: result.devCode,
      destination: result.destination,
    };
  }

  const code = String(formData.get('code') ?? '');
  const verified = await verifyOtp({ phone: data.phone, purpose: 'enquiry', code });
  if (!verified.ok) {
    return {
      step: 'verify',
      values,
      destination: data.phone,
      errors: { code: verified.message },
    };
  }

  const h = await headers();
  const ipAddress =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
  const userAgent = h.get('user-agent');

  try {
    const result = await createEnquiry({
      name: data.name,
      phone: data.phone,
      phoneVerified: true,
      email: data.email,
      city: data.city,
      budgetMaxRupees: data.budget,
      propertyType: data.propertyType,
      occupancy: data.occupancy,
      genderPolicy: data.genderPolicy,
      moveInDate: data.moveInDate,
      tenureMonths: data.tenureMonths,
      institutionSlug: data.near,
      listingSlug: data.listing,
      notes: data.notes,
      preferredLanguage: data.preferredLanguage,
      isUnder18: data.isUnder18,
      guardianName: data.guardianName,
      guardianPhone: data.guardianPhone,
      marketingConsent: data.consentMarketing,
      attribution: await readAttribution(),
      ipAddress,
      userAgent,
      siteHost: new URL(clientEnv().NEXT_PUBLIC_SITE_URL).hostname,
    });

    // A verified phone is the resident's account; sign them in so they can
    // follow the enquiry, save stays and raise support requests.
    const resident = await findOrCreateResident({
      phone: data.phone,
      name: data.name,
      email: data.email,
    });
    await signInResident({ userId: resident.id, ipAddress, userAgent });

    return {
      step: 'done',
      values: {},
      reference: result.reference,
      responsePromise: result.responsePromise,
      merged: result.merged,
    };
  } catch (error) {
    if (!(error instanceof LeadError)) console.error('[enquiry]', error);
    return {
      step: 'details',
      values,
      errors: {
        _form:
          error instanceof LeadError
            ? error.message
            : 'Something went wrong sending your enquiry. Please try again.',
      },
    };
  }
}

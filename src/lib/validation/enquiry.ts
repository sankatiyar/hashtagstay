import { z } from 'zod';

import { normalizeIndianMobile } from '@/lib/phone';

/**
 * Enquiry form validation. Shared by the send-code step and the final submit, so
 * a value that passed step one cannot be tampered with in step two.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const phone = z.string().transform((v, ctx) => {
  const normalized = normalizeIndianMobile(v);
  if (!normalized) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter a valid 10-digit Indian mobile number.',
    });
    return z.NEVER;
  }
  return normalized;
});

export const enquirySchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name.').max(120),
    phone,
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : null))
      .refine(
        (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        'Enter a valid email address.',
      ),
    city: optionalText(120),
    budget: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v.replace(/[,\s₹]/g, '')) : null))
      .refine(
        (v) => v === null || (Number.isFinite(v) && v > 0 && v < 10_000_000),
        'Enter a monthly budget in rupees.',
      ),
    propertyType: z
      .enum(['pbsa', 'coliving', 'homeshare', ''])
      .optional()
      .transform((v) => (v ? v : null)),
    occupancy: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine(
        (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 4),
        'Choose room sharing.',
      ),
    genderPolicy: z
      .enum(['any', 'male_only', 'female_only', ''])
      .optional()
      .transform((v) => (v ? v : null)),
    moveInDate: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(`${v}T00:00:00+05:30`) : null))
      .refine(
        (v) => v === null || !Number.isNaN(v.getTime()),
        'Choose a valid move-in date.',
      ),
    tenureMonths: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine(
        (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 60),
        'Choose how long you plan to stay.',
      ),
    preferredLanguage: z.string().trim().max(5).default('en'),
    notes: optionalText(2000),
    listing: optionalText(200),
    near: optionalText(200),
    isUnder18: z
      .string()
      .optional()
      .transform((v) => v === 'on' || v === 'true'),
    guardianName: optionalText(120),
    guardianPhone: z
      .string()
      .optional()
      .transform((v) => (v ? normalizeIndianMobile(v) : null)),
    consentContact: z
      .string()
      .optional()
      .transform((v) => v === 'on' || v === 'true'),
    consentMarketing: z
      .string()
      .optional()
      .transform((v) => v === 'on' || v === 'true'),
  })
  .superRefine((value, ctx) => {
    if (!value.consentContact) {
      ctx.addIssue({
        code: 'custom',
        path: ['consentContact'],
        message: 'We need your permission to contact you about this enquiry.',
      });
    }
    if (value.isUnder18) {
      if (!value.guardianName) {
        ctx.addIssue({
          code: 'custom',
          path: ['guardianName'],
          message: 'Enter a parent or guardian’s name.',
        });
      }
      if (!value.guardianPhone) {
        ctx.addIssue({
          code: 'custom',
          path: ['guardianPhone'],
          message: 'Enter a valid mobile number for your parent or guardian.',
        });
      }
    }
    if (value.moveInDate && value.moveInDate.getTime() < Date.now() - 86_400_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['moveInDate'],
        message: 'Move-in cannot be in the past.',
      });
    }
  });

export type EnquiryValues = z.infer<typeof enquirySchema>;

export const ENQUIRY_FIELDS = [
  'name',
  'phone',
  'email',
  'city',
  'budget',
  'propertyType',
  'occupancy',
  'genderPolicy',
  'moveInDate',
  'tenureMonths',
  'preferredLanguage',
  'notes',
  'listing',
  'near',
  'isUnder18',
  'guardianName',
  'guardianPhone',
  'consentContact',
  'consentMarketing',
] as const;

export function readEnquiryForm(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of ENQUIRY_FIELDS) {
    const value = formData.get(field);
    if (typeof value === 'string') out[field] = value;
  }
  return out;
}

export function enquiryErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    out[key] ??= issue.message;
  }
  return out;
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { actorFor, requirePermissionForAction } from '@/lib/auth/guard';
import { createProperty } from '@/lib/services/properties';
import {
  createPropertySchema,
  fieldErrors,
  parsePropertyForm,
} from '@/lib/validation/property';

export interface CreatePropertyState {
  /** Keyed by field path, e.g. "name" or "rooms.0.rentAmountMinor". */
  errors?: Record<string, string>;
  /** Values to re-render, so a validation failure never loses typed input. */
  values?: Record<string, unknown>;
}

export async function createPropertyAction(
  _previous: CreatePropertyState,
  formData: FormData,
): Promise<CreatePropertyState> {
  const user = await requirePermissionForAction('property:create');

  const raw = parsePropertyForm(formData);
  const parsed = createPropertySchema.safeParse(raw);

  if (!parsed.success) {
    // Hand back both the errors and the submitted values. Losing a long form's
    // contents to a validation failure is the fastest way to make ops enter
    // inventory in a spreadsheet instead.
    return { errors: fieldErrors(parsed.error), values: raw };
  }

  let created: { id: string; slug: string };
  try {
    created = await createProperty(parsed.data, actorFor(user));
  } catch (error) {
    return {
      errors: {
        _form:
          error instanceof Error
            ? error.message
            : 'Could not create the property. Please try again.',
      },
      values: raw,
    };
  }

  revalidatePath('/admin/properties');
  revalidatePath('/admin');
  // redirect throws, so it must sit outside the try block above or it would be
  // caught and reported as a failure.
  redirect(`/admin/properties/${created.id}`);
}

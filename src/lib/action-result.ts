/**
 * The shape every form-bound server action returns, so one client component can
 * render success and failure for all of them.
 */
export interface ActionResult {
  error?: string;
  ok?: string;
  /** Optional payload, e.g. a generated URL to show. */
  data?: Record<string, string>;
}

export const initialActionResult: ActionResult = {};

/**
 * Run an action body and turn a thrown error into a user-facing message. Errors
 * thrown by our own services carry messages written for the person using the
 * screen; anything unexpected is logged and replaced with a generic message so
 * internals never leak into the page.
 */
export async function runAction(
  fn: () => Promise<ActionResult | void>,
): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: 'Done.' };
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { digest?: string }).digest?.startsWith('NEXT_')
    ) {
      throw error;
    }
    const known =
      error instanceof Error &&
      /Error$/.test(error.name) &&
      error.name !== 'Error' &&
      error.name !== 'TypeError' &&
      error.name !== 'PostgresError';
    if (!known) console.error('[action]', error);
    return {
      error: known
        ? (error as Error).message
        : 'Something went wrong. Please try again.',
    };
  }
}

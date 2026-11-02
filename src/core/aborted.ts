/**
 * Shared handling of the 'aborted' result variant (architecture 5.3 amendment).
 * Services whose caller supplied an AbortSignal return ABORTED when the signal
 * fired before the work finished; callers discard it without any state change
 * or message. The variant itself is defined with the LegacyLocationService port.
 */
import { ABORTED } from './ports/locationService';
import type { Aborted } from './ports/locationService';

export { ABORTED };
export type { Aborted };

/**
 * Narrowing guard for any result union that includes the Aborted variant.
 *
 * TEMPORARY BRIDGE (migration batch 2): at run time it also accepts the approved form, an `AppError` of kind
 * 'aborted' (architecture 3.1), so callers need no change when a service switches over. The type still narrows only
 * the legacy variant, because narrowing every error result away would hide real errors. A later batch removes the
 * legacy `ABORTED` variant and narrows to the approved form.
 */
export function isAbortedResult<R extends { readonly ok: boolean }>(result: R): result is Extract<R, Aborted> {
  if (result.ok) return false;
  if ('aborted' in result) return true;
  const error = (result as { readonly error?: { readonly kind?: unknown } }).error;
  return error?.kind === 'aborted';
}

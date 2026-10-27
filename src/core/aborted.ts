/**
 * Shared handling of the 'aborted' result variant (architecture 5.3 amendment).
 * Services whose caller supplied an AbortSignal return ABORTED when the signal
 * fired before the work finished; callers discard it without any state change
 * or message. The variant itself is defined with the LocationService port.
 */
import { ABORTED } from './ports/locationService';
import type { Aborted } from './ports/locationService';

export { ABORTED };
export type { Aborted };

/** Narrowing guard for any result union that includes the Aborted variant. */
export function isAbortedResult<R extends { readonly ok: boolean }>(result: R): result is Extract<R, Aborted> {
  return !result.ok && 'aborted' in result;
}

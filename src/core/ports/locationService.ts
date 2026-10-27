import type { AppError } from '../errors';
import type { Err, Ok } from '../result';

export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Outcome of a call whose AbortSignal fired before it completed. Not an
 * AppError: an abort is a caller decision, not a failure to show to the user.
 */
export interface Aborted {
  readonly ok: false;
  readonly aborted: true;
}

export const ABORTED: Aborted = Object.freeze({ ok: false, aborted: true });

/** Result of getCurrentPosition: success, a typed failure, or an aborted request. */
export type PositionResult = Ok<Coordinates> | Err<AppError> | Aborted;

/** Type guard: true when the result is the 'aborted' variant. */
export function isAborted(result: PositionResult): result is Aborted {
  return !result.ok && 'aborted' in result;
}

/**
 * Architecture 5.3 (with the user-approved amendment of 2026-10-26: aborted
 * calls resolve to ABORTED). Methods never throw.
 *
 * Portability rule: when the platform cannot report a permission state,
 * getPermissionState returns 'prompt'; denial or grant is then learned from the
 * getCurrentPosition outcome.
 */
export interface LocationService {
  getPermissionState(): Promise<PermissionState>;
  /**
   * Resolves (never hangs) to one of:
   * - Ok with coordinates;
   * - Err with AppError code LOCATION_DENIED, LOCATION_UNAVAILABLE or TIMEOUT;
   * - ABORTED (`{ ok: false, aborted: true }`) when `signal` aborts before the
   *   platform answers. Callers must discard it without changing state or
   *   showing a message; use `isAborted` to detect it.
   * This call is the point at which the platform asks for permission.
   */
  getCurrentPosition(timeoutMs: number, signal: AbortSignal): Promise<PositionResult>;
}

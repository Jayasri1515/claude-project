import type { Coordinates } from '../domain';
import type { AppError } from '../errors';
import type { Err, Ok, Result } from '../result';

/**
 * `unknown` means the platform has no usable Permissions API (absent, throwing, or an unrecognised value). The Location
 * Flow needs it apart from `prompt` because a prompt wait cannot then be told from a slow fix (architecture 3.3 step 2).
 */
export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown';

// `Coordinates` is part of the approved domain model (src/core/domain.ts); re-exported so existing imports keep working.
export type { Coordinates };

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
 * Approved location port (architecture 3.1, impl-plan T-13). The port has NO timeout: the app-owned watchdog lives in
 * the Location Flow (C5, architecture 3.3, DR-06). The call is the point at which the platform may ask for permission,
 * and it can stay pending for as long as the prompt is unanswered. Never throws. Failures are `err(AppError)` of kind
 * `permission_denied`, `position_unavailable` or `unsupported`. When `signal` aborts the call settles with
 * `err(aborted())` (cancellation means "discard"; nothing is shown).
 */
export interface LocationService {
  getPosition(signal: AbortSignal): Promise<Result<Coordinates, AppError>>;
}

/**
 * LEGACY port (pre-approval architecture 5.3): reports the permission state. Still used by `locationFlow.ts` and the
 * browser adapter until T-26 and T-32 replace them. Remove with those tasks. Unlike the approved port it still has
 * `getPermissionState`, which the Location Flow needs to place the app-owned watchdog (architecture 3.3 step 2).
 *
 * Architecture 5.3 (with the user-approved amendment of 2026-10-26: aborted
 * calls resolve to ABORTED). Methods never throw.
 *
 * When the platform cannot report a permission state, getPermissionState returns 'unknown'; denial or grant is then
 * learned from the getCurrentPosition outcome.
 */
export interface LegacyLocationService {
  getPermissionState(): Promise<PermissionState>;
  /**
   * Resolves (never hangs) to one of:
   * - Ok with coordinates;
   * - Err with AppError code LOCATION_DENIED, LOCATION_UNAVAILABLE or TIMEOUT;
   * - ABORTED (`{ ok: false, aborted: true }`) when `signal` aborts before the
   *   platform answers. Callers must discard it without changing state or
   *   showing a message; use `isAborted` to detect it.
   * This call is the point at which the platform asks for permission. It carries NO timeout: the watchdog is owned by
   * the Location Flow (architecture 3.3, DR-06), so the call can stay pending while a prompt is unanswered.
   */
  getCurrentPosition(signal: AbortSignal): Promise<PositionResult>;
  /**
   * Optional. Resolves true when the platform reports that the permission changed to 'granted' (the user answered a
   * prompt), and false when it cannot be watched, was denied, or `signal` aborts. Never rejects. The Location Flow
   * starts its watchdog on true (architecture 3.3 step 2: a prompt left unanswered is not a timeout).
   */
  whenPermissionGranted?(signal: AbortSignal): Promise<boolean>;
}

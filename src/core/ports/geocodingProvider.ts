import type { Location } from '../domain';
import type { AppError } from '../errors';
import type { Result } from '../result';

/**
 * Architecture 5.1 (with the user-approved amendment of 2026-10-26: optional
 * AbortSignal). Methods never throw; failures are returned as AppError.
 *
 * The optional `signal` lets the caller cancel a superseded request (for
 * example when a newer search replaces it). Adapters should stop work when it
 * aborts; callers discard the outcome of any aborted request. Omitting the
 * signal keeps the previous behavior. No geocoding timeout is configured: the
 * architecture 4.12 Config defines only weather and location timeouts.
 */
export interface GeocodingProvider {
  /** Returns an empty list for no match (mapped to NOT_FOUND by the Search Service). */
  search(query: string, limit: number, signal?: AbortSignal): Promise<Result<Location[], AppError>>;
  /** Optional. Absence means device locations stay labeled "Current location". */
  reverse?(lat: number, lon: number, signal?: AbortSignal): Promise<Result<Location, AppError>>;
}

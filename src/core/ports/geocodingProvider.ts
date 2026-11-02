import type { Coordinates, Location, Place } from '../domain';
import type { AppError } from '../errors';
import type { Result } from '../result';

/**
 * Approved geocoding port (architecture 3.1, impl-plan T-13). Methods never throw; failures are returned as
 * `AppError`. When `signal` aborts, the call settles with `err(aborted())`; callers discard it silently.
 */
export interface GeocodingProvider {
  /** Forward search. An empty list means no match (the Search Service turns it into `not_found`). */
  search(text: string, limit: number, signal: AbortSignal): Promise<Result<Place[], AppError>>;
  /**
   * Optional reverse geocoding (U1). Left unimplemented under baseline option (a): the provider has no reverse
   * endpoint (provider-verification.md item 6), so a device location keeps the label "Current location".
   */
  reverse?(coords: Coordinates, signal: AbortSignal): Promise<Result<Place, AppError>>;
}

/**
 * LEGACY port (pre-approval architecture 5.1, optional AbortSignal) still used by `search.ts`, `locationFlow.ts` and the
 * Open-Meteo geocoding adapter until T-21, T-26 and T-31 replace them. Remove with those tasks.
 */
export interface LegacyGeocodingProvider {
  /** Returns an empty list for no match (mapped to not_found by the Search Service). */
  search(query: string, limit: number, signal?: AbortSignal): Promise<Result<Location[], AppError>>;
  /** Optional. Absence means device locations stay labeled "Current location". */
  reverse?(lat: number, lon: number, signal?: AbortSignal): Promise<Result<Location, AppError>>;
}

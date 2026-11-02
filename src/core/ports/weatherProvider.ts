import type { Coordinates, WeatherResult } from '../domain';
import type { AppError } from '../errors';
import type { Result } from '../result';

/**
 * Approved weather port (architecture 3.1, impl-plan T-13). One call returns both sections.
 *
 * - A transport, timeout or rate-limit failure fails the whole call: `err(AppError)`.
 * - A response that arrives but lacks or invalidates one section gives a per-section error inside the `WeatherResult`.
 * - The adapter normalizes to canonical units and condition categories, leaves missing fields undefined, never throws,
 *   and honors `signal`. When the signal aborts, the call settles with `err(aborted())`, an internal outcome that is
 *   never shown to the user and never mapped to `network`.
 * - Errors never contain the request URL or the coordinates.
 */
export interface WeatherProvider {
  get(coords: Coordinates, signal: AbortSignal): Promise<Result<WeatherResult, AppError>>;
}

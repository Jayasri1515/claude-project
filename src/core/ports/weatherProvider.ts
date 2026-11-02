import type { Coordinates, CurrentWeather, ForecastDay, Location, WeatherResult } from '../domain';
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

/**
 * LEGACY two-method port (pre-approval architecture 5.2) still used by `weatherService.ts` and the Open-Meteo adapter
 * until T-20 and T-30 replace them. Remove with those tasks.
 */
export interface LegacyWeatherProvider {
  getCurrent(loc: Location, signal: AbortSignal): Promise<Result<CurrentWeather, AppError>>;
  getForecast(
    loc: Location,
    days: number,
    includeToday: boolean,
    signal: AbortSignal,
  ): Promise<Result<ForecastDay[], AppError>>;
}

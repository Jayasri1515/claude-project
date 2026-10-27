import type { CurrentWeather, ForecastDay, Location } from '../domain';
import type { AppError } from '../errors';
import type { Result } from '../result';

/**
 * Architecture 5.2. Adapters normalize to canonical units, map provider
 * conditions to ConditionCode, leave missing fields undefined, and honor the
 * abort signal. Methods never throw.
 */
export interface WeatherProvider {
  getCurrent(loc: Location, signal: AbortSignal): Promise<Result<CurrentWeather, AppError>>;
  getForecast(
    loc: Location,
    days: number,
    includeToday: boolean,
    signal: AbortSignal,
  ): Promise<Result<ForecastDay[], AppError>>;
}

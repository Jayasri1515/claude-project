/**
 * DEMO-ONLY providers (TASK-036). They implement the GeocodingProvider and
 * WeatherProvider ports with invented, deterministic data so the whole UI can be
 * run with no external service. Nothing here is a fact about any real weather
 * provider, endpoint, place or payload, and the app shows a demo notice while
 * they are wired in. TASK-037 replaces them with real adapters once the
 * provider facts (TASK-001) are verified.
 *
 * Scripted behaviors, so error states can be tried by hand:
 * - search "Testville": one match; "Sampleton": two matches (chooser);
 *   "Partialia": one match whose weather has gaps; "Glitchton": one match whose
 *   forecast fails; the text "error": the search service fails; anything else:
 *   no match.
 */
import type { CurrentWeather, ConditionCode, ForecastDay, Location } from '../core/domain';
import { locationUnavailable, serviceUnavailable } from '../core/errors';
import type { AppError } from '../core/errors';
import { makeLocationKey } from '../core/favorites/identity';
import type { Clock, GeocodingProvider, LocationService, PermissionState, PositionResult, WeatherProvider } from '../core/ports';
import { err, ok } from '../core/result';
import type { Result } from '../core/result';

const PROVIDER_ID = 'demo';
const LATENCY_MS = 400;

function place(placeId: string, name: string, admin1: string, country: string, lat: number, lon: number): Location {
  return {
    key: makeLocationKey({ providerId: PROVIDER_ID, placeId, name, admin1, country }),
    name,
    admin1,
    country,
    latitude: lat,
    longitude: lon,
    timezone: 'Etc/UTC',
    placeId,
    source: 'search',
  };
}

const PLACES: readonly Location[] = [
  place('1', 'Testville', 'Testshire', 'Testland', 10.5, 20.25),
  place('2', 'Sampleton', 'Exampleshire', 'Testland', 30.1, -40.2),
  place('3', 'Sampleton', 'Northern Sample', 'Otherland', -12.7, 55.9),
  place('4', 'Partialia', 'Gapshire', 'Testland', 5.25, 5.75),
  place('5', 'Glitchton', 'Faultshire', 'Testland', -3.5, 8.5),
];

/** Resolves after `ms`, or earlier with false if the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class DemoGeocodingProvider implements GeocodingProvider {
  async search(query: string, limit: number, signal?: AbortSignal): Promise<Result<Location[], AppError>> {
    const completed = await wait(LATENCY_MS / 2, signal ?? new AbortController().signal);
    if (!completed) return err(serviceUnavailable());
    const needle = query.trim().toLowerCase();
    if (needle === 'error') return err(serviceUnavailable());
    return ok(PLACES.filter((p) => p.name.toLowerCase().startsWith(needle)).slice(0, limit));
  }
}

const CONDITIONS: readonly ConditionCode[] = ['CLEAR', 'PARTLY_CLOUDY', 'CLOUDY', 'RAIN', 'SNOW', 'THUNDERSTORM', 'FOG'];

function seed(loc: Location): number {
  return Math.abs(Math.round(loc.latitude * 10 + loc.longitude * 7));
}

/**
 * Demo WeatherProvider. Forecast dates are built from the injected Clock (days
 * after the Clock's current UTC date), so the demo never shows dates from the
 * past. The demo places all use the Etc/UTC zone, so the UTC date is the local date.
 */
export class DemoWeatherProvider implements WeatherProvider {
  constructor(private readonly clock: Clock) {}

  async getCurrent(loc: Location, signal: AbortSignal): Promise<Result<CurrentWeather, AppError>> {
    if (!(await wait(LATENCY_MS, signal))) return err(serviceUnavailable());
    const n = seed(loc);
    const partial = loc.placeId === '4';
    return ok({
      temperatureC: (n % 35) - 5,
      ...(partial ? {} : { humidityPct: 30 + (n % 60) }),
      ...(partial ? {} : { condition: CONDITIONS[n % CONDITIONS.length] as ConditionCode }),
    });
  }

  async getForecast(
    loc: Location,
    days: number,
    includeToday: boolean,
    signal: AbortSignal,
  ): Promise<Result<ForecastDay[], AppError>> {
    if (!(await wait(LATENCY_MS * 1.5, signal))) return err(serviceUnavailable());
    if (loc.placeId === '5') return err(serviceUnavailable());
    const n = seed(loc);
    const available = loc.placeId === '4' ? Math.min(days, 2) : days;
    const now = this.clock.now();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const result: ForecastDay[] = [];
    for (let i = 0; i < available; i += 1) {
      const date = new Date(start.getTime() + (i + (includeToday ? 0 : 1)) * 86_400_000);
      result.push({
        date: date.toISOString().slice(0, 10),
        tempMaxC: ((n + i * 3) % 35) - 2,
        tempMinC: ((n + i * 3) % 35) - 9,
        condition: CONDITIONS[(n + i) % CONDITIONS.length] as ConditionCode,
      });
    }
    return ok(result);
  }
}

/**
 * Demo LocationService. In demo mode the real device position is never read:
 * the permission reads as unsupported, so "Use my location" shows the normal
 * "could not be determined" message and the browser never asks for permission.
 */
export class DemoLocationService implements LocationService {
  getPermissionState(): Promise<PermissionState> {
    return Promise.resolve('unsupported');
  }

  getCurrentPosition(): Promise<PositionResult> {
    return Promise.resolve(err(locationUnavailable()));
  }
}

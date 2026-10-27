/**
 * WeatherProvider over the Open-Meteo Forecast API (TASK-023).
 *
 * Endpoint, parameters, units and response shape were checked against the
 * official documentation on 2026-10-27 (https://open-meteo.com/en/docs; see
 * impl-plan TASK-023 for what was checked):
 *   GET https://api.open-meteo.com/v1/forecast
 *     ?latitude=<n>&longitude=<n>&timezone=auto&temperature_unit=celsius
 *     current:  &current=temperature_2m,relative_humidity_2m,weather_code
 *     forecast: &daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=<1..16>
 *   success: { timezone, utc_offset_seconds, current: { time, temperature_2m, ... } }
 *            { daily: { time: ["YYYY-MM-DD", ...], temperature_2m_max: [...], ... } }
 *   failure: HTTP 400 with { error: true, reason: "..." } (the reason text is never shown).
 *
 * Latitude and longitude are rounded to 2 decimals in the request (see COORDINATE_DECIMALS).
 *
 * No API key is used. `timezone=auto` makes the response (daily dates, the
 * `current.time` stamp, `timezone`, `utc_offset_seconds`) follow the location's
 * own time zone: forecast dates are the location's calendar dates, and
 * `observedAt` is the real instant (the local stamp minus the reported UTC offset).
 *
 * Normalization: Celsius is requested explicitly and a response that reports any
 * other unit is rejected, so values stay in Celsius and percent. A missing, null
 * or non-numeric field stays undefined (never 0). Unknown condition codes become
 * UNKNOWN. Anything structurally wrong (not an object, no `current` or `daily`
 * block, unusable `daily.time`) is SERVICE_UNAVAILABLE.
 */
import type { CurrentWeather, ForecastDay, Location } from '../../core/domain';
import { serviceUnavailable } from '../../core/errors';
import type { AppError } from '../../core/errors';
import type { WeatherProvider } from '../../core/ports';
import { err, ok } from '../../core/result';
import type { Result } from '../../core/result';
import { mapWeatherCode } from './conditionCodes';
import { defaultFetch, finiteNumber, getJson, isRecord } from './http';
import type { FetchLike, OpenMeteoOptions } from './http';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
/** Documented maximum of `forecast_days`. */
const MAX_FORECAST_DAYS = 16;
const CELSIUS = '°C';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Coordinates are rounded to this many decimals before they are sent (impl-plan L2, user-approved 2026-10-27).
 * Why: (1) the forecast is computed on the provider's model grid (the documentation lists model resolutions of
 * about 2 to 11 km, and the response reports the grid cell's coordinates, not the ones sent), so two decimals
 * (about 1.1 km of latitude) cost no usable accuracy; (2) privacy: a device location is sent at about 1 km
 * precision instead of the full precision of the Geolocation API. Only the request is rounded: the `Location`
 * kept in the app, stored in favorites and shown stays exact.
 */
export const COORDINATE_DECIMALS = 2;

/**
 * `value` rounded to COORDINATE_DECIMALS, halves away from zero (so 0.125 and -0.125 round to 0.13 and -0.13;
 * Math.round alone would give -0.12), never negative zero ("-0" would be sent for -0.004). The decimal
 * representation of a double can make a value that looks like a half round either way (1.005 gives 1), which is
 * harmless: the result is within 0.005 degrees (about 550 m) of the input.
 */
export function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return rounded === 0 ? 0 : rounded; // turns -0 into 0
}

function baseUrl(loc: Location): URL | undefined {
  if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return undefined;
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(roundCoordinate(loc.latitude)));
  url.searchParams.set('longitude', String(roundCoordinate(loc.longitude)));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('temperature_unit', 'celsius');
  return url;
}

/** True when the response reports a unit for `name` and it is not the expected one. */
function wrongUnit(units: unknown, name: string, expected: string): boolean {
  if (!isRecord(units)) return false;
  const unit = units[name];
  return unit !== undefined && unit !== expected;
}

/** "2026-10-26T19:45" in a zone with the given UTC offset, as a real instant. */
function observedInstant(time: unknown, offsetSeconds: number | undefined): Date | undefined {
  if (typeof time !== 'string' || offsetSeconds === undefined) return undefined;
  const m = LOCAL_TIME_PATTERN.exec(time);
  if (m === null) return undefined;
  const [, year, month, day, hour, minute, second] = m;
  const ms =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0)) -
    offsetSeconds * 1000;
  return Number.isNaN(ms) ? undefined : new Date(ms);
}

export function parseCurrent(body: unknown): Result<CurrentWeather, AppError> {
  if (!isRecord(body) || body['error'] === true) return err(serviceUnavailable());
  const current = body['current'];
  if (!isRecord(current)) return err(serviceUnavailable());
  const units = body['current_units'];
  if (wrongUnit(units, 'temperature_2m', CELSIUS) || wrongUnit(units, 'relative_humidity_2m', '%')) {
    return err(serviceUnavailable());
  }

  const temperatureC = finiteNumber(current['temperature_2m']);
  const humidity = finiteNumber(current['relative_humidity_2m']);
  const humidityPct = humidity !== undefined && humidity >= 0 && humidity <= 100 ? humidity : undefined;
  const mapped = mapWeatherCode(current['weather_code']);
  const observedAt = observedInstant(current['time'], finiteNumber(body['utc_offset_seconds']));

  return ok({
    ...(temperatureC !== undefined ? { temperatureC } : {}),
    ...(humidityPct !== undefined ? { humidityPct } : {}),
    ...(mapped !== undefined ? { condition: mapped.condition } : {}),
    ...(mapped?.text !== undefined ? { conditionText: mapped.text } : {}),
    ...(observedAt !== undefined ? { observedAt } : {}),
  });
}

/**
 * The days in the response, in order. With `dropFirst` the first entry (today in the location's zone)
 * is left out; the caller limits the day count.
 */
export function parseDaily(body: unknown, dropFirst = false): Result<ForecastDay[], AppError> {
  if (!isRecord(body) || body['error'] === true) return err(serviceUnavailable());
  const daily = body['daily'];
  if (!isRecord(daily) || !Array.isArray(daily['time'])) return err(serviceUnavailable());
  const units = body['daily_units'];
  if (wrongUnit(units, 'temperature_2m_max', CELSIUS) || wrongUnit(units, 'temperature_2m_min', CELSIUS)) {
    return err(serviceUnavailable());
  }

  const times = daily['time'] as unknown[];
  const column = (name: string): unknown[] => (Array.isArray(daily[name]) ? (daily[name] as unknown[]) : []);
  const maxes = column('temperature_2m_max');
  const mins = column('temperature_2m_min');
  const codes = column('weather_code');

  const days: ForecastDay[] = [];
  times.forEach((date, index) => {
    if (dropFirst && index === 0) return;
    if (typeof date !== 'string' || !DATE_PATTERN.test(date)) return; // a day without a date cannot be shown
    const tempMaxC = finiteNumber(maxes[index]);
    const tempMinC = finiteNumber(mins[index]);
    const mapped = mapWeatherCode(codes[index]);
    days.push({
      date,
      ...(tempMinC !== undefined ? { tempMinC } : {}),
      ...(tempMaxC !== undefined ? { tempMaxC } : {}),
      ...(mapped !== undefined ? { condition: mapped.condition } : {}),
      ...(mapped?.text !== undefined ? { conditionText: mapped.text } : {}),
    });
  });
  return ok(days);
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number | undefined;

  constructor(options: OpenMeteoOptions = {}) {
    this.fetchFn = options.fetch ?? defaultFetch;
    this.timeoutMs = options.timeoutMs;
  }

  async getCurrent(loc: Location, signal: AbortSignal): Promise<Result<CurrentWeather, AppError>> {
    try {
      const url = baseUrl(loc);
      if (url === undefined) return err(serviceUnavailable());
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code');
      const response = await getJson(url.toString(), { fetch: this.fetchFn, timeoutMs: this.timeoutMs, signal });
      return response.ok ? parseCurrent(response.value) : response;
    } catch {
      return err(serviceUnavailable());
    }
  }

  async getForecast(
    loc: Location,
    days: number,
    includeToday: boolean,
    signal: AbortSignal,
  ): Promise<Result<ForecastDay[], AppError>> {
    try {
      const wanted = Number.isFinite(days) ? Math.trunc(days) : 0;
      if (wanted < 1) return ok([]);
      const url = baseUrl(loc);
      if (url === undefined) return err(serviceUnavailable());
      // Day 0 of the response is today in the location's zone. Without today, ask for one more day and drop it.
      const requested = Math.min(MAX_FORECAST_DAYS, includeToday ? wanted : wanted + 1);
      url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
      url.searchParams.set('forecast_days', String(requested));
      const response = await getJson(url.toString(), { fetch: this.fetchFn, timeoutMs: this.timeoutMs, signal });
      if (!response.ok) return response;

      const parsed = parseDaily(response.value, !includeToday);
      return parsed.ok ? ok(parsed.value.slice(0, wanted)) : parsed;
    } catch {
      return err(serviceUnavailable());
    }
  }
}

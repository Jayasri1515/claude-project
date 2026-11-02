/**
 * WeatherProvider over the Open-Meteo Forecast API (TASK-023, impl-plan T-30).
 *
 * Endpoint, parameters, units and response shape were checked against the
 * official documentation on 2026-10-27 (https://open-meteo.com/en/docs; see
 * impl-plan TASK-023 for what was checked):
 *   GET https://api.open-meteo.com/v1/forecast
 *     ?latitude=<n>&longitude=<n>&timezone=auto&temperature_unit=celsius
 *     current:  &current=temperature_2m,relative_humidity_2m,weather_code,is_day
 *     forecast: &daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=<1..16>
 *   success: { timezone, utc_offset_seconds, current: { time, temperature_2m, ... } }
 *            { daily: { time: ["YYYY-MM-DD", ...], temperature_2m_max: [...], ... } }
 *   failure: HTTP 400 with { error: true, reason: "..." } (the reason text is never shown).
 *
 * Latitude and longitude are rounded in the request to `Config.coordinateDecimals` (2 by default).
 *
 * No API key is used. `timezone=auto` makes the response (daily dates, the
 * `current.time` stamp, `timezone`, `utc_offset_seconds`) follow the location's
 * own time zone: forecast dates are the location's calendar dates.
 *
 * Normalization: Celsius is requested explicitly and a response that reports any
 * other unit is rejected, so values stay in Celsius and percent. A missing, null
 * or non-numeric field stays undefined (never 0). Unknown condition codes become
 * UNKNOWN. Anything structurally wrong (not an object, no `current` or `daily`
 * block, unusable `daily.time`) is SERVICE_UNAVAILABLE.
 */
import { DEFAULT_CONFIG, MAX_PROVIDER_FORECAST_DAYS } from '../../core/config';
import type { Coordinates, Current, Day, WeatherResult } from '../../core/domain';
import { aborted, invalidResponse, serviceUnavailable } from '../../core/errors';
import type { AppError } from '../../core/errors';
import type { WeatherProvider } from '../../core/ports';
import { err, ok } from '../../core/result';
import type { Result } from '../../core/result';
import { mapWeatherCode } from './conditionCodes';
import { defaultFetch, finiteNumber, getJson, isRecord, nonEmptyString } from './http';
import type { FetchLike, OpenMeteoOptions } from './http';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CELSIUS = '°C';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coordinates are rounded to `Config.coordinateDecimals` (2) before they are sent (impl-plan L2, user-approved 2026-10-27).
 * The value is read from Config, not kept here.
 * Why: (1) the forecast is computed on the provider's model grid (the documentation lists model resolutions of
 * about 2 to 11 km, and the response reports the grid cell's coordinates, not the ones sent), so two decimals
 * (about 1.1 km of latitude) cost no usable accuracy; (2) privacy: a device location is sent at about 1 km
 * precision instead of the full precision of the Geolocation API. Only the request is rounded: the `Location`
 * kept in the app, stored in favorites and shown stays exact.
 */
/**
 * `value` rounded to `decimals` (default: Config's `coordinateDecimals`), halves away from zero (so 0.125 and -0.125 round to 0.13 and -0.13;
 * Math.round alone would give -0.12), never negative zero ("-0" would be sent for -0.004). The decimal
 * representation of a double can make a value that looks like a half round either way (1.005 gives 1), which is
 * harmless: the result is within 0.005 degrees (about 550 m) of the input.
 */
export function roundCoordinate(value: number, decimals: number = DEFAULT_CONFIG.coordinateDecimals): number {
  const factor = 10 ** decimals;
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return rounded === 0 ? 0 : rounded; // turns -0 into 0
}

function baseUrl(latitude: number, longitude: number, decimals: number): URL | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(roundCoordinate(latitude, decimals)));
  url.searchParams.set('longitude', String(roundCoordinate(longitude, decimals)));
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

export function parseCurrent(body: unknown): Result<Current, AppError> {
  if (!isRecord(body)) return err(invalidResponse());
  if (body['error'] === true) return err(serviceUnavailable());
  const current = body['current'];
  if (!isRecord(current)) return err(invalidResponse());
  const units = body['current_units'];
  if (wrongUnit(units, 'temperature_2m', CELSIUS) || wrongUnit(units, 'relative_humidity_2m', '%')) {
    return err(invalidResponse());
  }

  const tempCanonical = finiteNumber(current['temperature_2m']);
  const humidity = finiteNumber(current['relative_humidity_2m']);
  const humidityPct = humidity !== undefined && humidity >= 0 && humidity <= 100 ? humidity : undefined;
  const mapped = mapWeatherCode(current['weather_code']);
  // `is_day` is 1 by day and 0 at night; anything else leaves the flag absent (the UI then shows the neutral form).
  const isDay = current['is_day'] === 1 ? true : current['is_day'] === 0 ? false : undefined;

  return ok({
    ...(tempCanonical !== undefined ? { tempCanonical } : {}),
    ...(humidityPct !== undefined ? { humidityPct } : {}),
    ...(mapped !== undefined ? { conditionCategory: mapped.condition } : {}),
    ...(isDay !== undefined ? { isDay } : {}),
  });
}

/**
 * The days in the response, in order. With `dropFirst` the first entry (today in the location's zone)
 * is left out; the caller limits the day count.
 */
export function parseDaily(body: unknown, dropFirst = false): Result<Day[], AppError> {
  if (!isRecord(body)) return err(invalidResponse());
  if (body['error'] === true) return err(serviceUnavailable());
  const daily = body['daily'];
  if (!isRecord(daily) || !Array.isArray(daily['time'])) return err(invalidResponse());
  const units = body['daily_units'];
  if (wrongUnit(units, 'temperature_2m_max', CELSIUS) || wrongUnit(units, 'temperature_2m_min', CELSIUS)) {
    return err(invalidResponse());
  }

  const times = daily['time'] as unknown[];
  const column = (name: string): unknown[] => (Array.isArray(daily[name]) ? (daily[name] as unknown[]) : []);
  const maxes = column('temperature_2m_max');
  const mins = column('temperature_2m_min');
  const codes = column('weather_code');

  const days: Day[] = [];
  times.forEach((localDate, index) => {
    if (dropFirst && index === 0) return;
    if (typeof localDate !== 'string' || !DATE_PATTERN.test(localDate)) return; // a day without a date cannot be shown
    const highCanonical = finiteNumber(maxes[index]);
    const lowCanonical = finiteNumber(mins[index]);
    const mapped = mapWeatherCode(codes[index]);
    days.push({
      localDate,
      ...(lowCanonical !== undefined ? { lowCanonical } : {}),
      ...(highCanonical !== undefined ? { highCanonical } : {}),
      ...(mapped !== undefined ? { conditionCategory: mapped.condition } : {}),
    });
  });
  return ok(days);
}

export interface OpenMeteoWeatherOptions extends OpenMeteoOptions {
  readonly coordinateDecimals?: number;
  /** Days the approved `get` asks for. Defaults to `Config.forecastDays`. */
  readonly forecastDays?: number;
  /** Whether day 0 (today at the location) is one of them. Defaults to `Config.forecastIncludesToday`. */
  readonly forecastIncludesToday?: boolean;
}

/** The two raw (unparsed) provider answers of one weather request. */
type Raw = Result<unknown, AppError>;

export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number | undefined;
  private readonly coordinateDecimals: number;
  private readonly forecastDays: number;
  private readonly forecastIncludesToday: boolean;

  constructor(options: OpenMeteoWeatherOptions = {}) {
    this.fetchFn = options.fetch ?? defaultFetch;
    this.timeoutMs = options.timeoutMs;
    this.coordinateDecimals = options.coordinateDecimals ?? DEFAULT_CONFIG.coordinateDecimals;
    this.forecastDays = options.forecastDays ?? DEFAULT_CONFIG.forecastDays;
    this.forecastIncludesToday = options.forecastIncludesToday ?? DEFAULT_CONFIG.forecastIncludesToday;
  }

  /**
   * Approved port (architecture 3.1, DR-19). Two parallel requests under the same signal, one per section. Each
   * request maps to its own section result; only when BOTH fail does the whole call fail (with the first error,
   * the current-conditions one). A caller abort settles as `aborted`.
   */
  async get(coords: Coordinates, signal: AbortSignal): Promise<Result<WeatherResult, AppError>> {
    try {
      if (signal.aborted) return err(aborted());
      const wanted = this.wantedDays(this.forecastDays);
      const [currentRaw, dailyRaw] = await Promise.all([
        this.requestCurrent(coords.lat, coords.lon, signal),
        wanted < 1
          ? Promise.resolve<Raw>(ok({ daily: { time: [] } }))
          : this.requestDaily(coords.lat, coords.lon, wanted, this.forecastIncludesToday, signal),
      ]);
      if (signal.aborted || isAborted(currentRaw) || isAborted(dailyRaw)) return err(aborted());

      const current = currentRaw.ok ? parseCurrent(currentRaw.value) : currentRaw;
      const parsedDaily = dailyRaw.ok ? parseDaily(dailyRaw.value, !this.forecastIncludesToday) : dailyRaw;
      const forecast = parsedDaily.ok ? ok(parsedDaily.value.slice(0, Math.max(wanted, 0))) : parsedDaily;
      if (!current.ok && !forecast.ok) return err(current.error);

      const timeZone = (currentRaw.ok ? zoneOf(currentRaw.value) : undefined) ?? (dailyRaw.ok ? zoneOf(dailyRaw.value) : undefined);
      return ok({ ...(timeZone !== undefined ? { timeZone } : {}), current, forecast });
    } catch {
      return err(serviceUnavailable());
    }
  }

  private wantedDays(days: number): number {
    return Number.isFinite(days) ? Math.trunc(days) : 0;
  }

  private async requestCurrent(latitude: number, longitude: number, signal: AbortSignal): Promise<Raw> {
    try {
      const url = baseUrl(latitude, longitude, this.coordinateDecimals);
      if (url === undefined) return err(serviceUnavailable());
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,is_day');
      return await getJson(url.toString(), { fetch: this.fetchFn, timeoutMs: this.timeoutMs, signal });
    } catch {
      return err(serviceUnavailable());
    }
  }

  private async requestDaily(
    latitude: number,
    longitude: number,
    wanted: number,
    includeToday: boolean,
    signal: AbortSignal,
  ): Promise<Raw> {
    try {
      const url = baseUrl(latitude, longitude, this.coordinateDecimals);
      if (url === undefined) return err(serviceUnavailable());
      // Day 0 of the response is today in the location's zone. Without today, ask for one more day and drop it.
      const requested = Math.min(MAX_PROVIDER_FORECAST_DAYS, includeToday ? wanted : wanted + 1);
      url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
      url.searchParams.set('forecast_days', String(requested));
      return await getJson(url.toString(), { fetch: this.fetchFn, timeoutMs: this.timeoutMs, signal });
    } catch {
      return err(serviceUnavailable());
    }
  }
}

function isAborted(result: Raw): boolean {
  return !result.ok && result.error.kind === 'aborted';
}

/** The IANA `timezone` of a response body, when present. */
function zoneOf(body: unknown): string | undefined {
  return isRecord(body) && body['error'] !== true ? nonEmptyString(body['timezone']) : undefined;
}

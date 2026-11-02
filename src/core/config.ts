/**
 * Config (C10, architecture 4.10, impl-plan T-11). A single typed, validated object for the tunable values. The
 * defaults are the approved baseline (architecture Section 7); provider-derived values follow provider-verification.md.
 * No timeout or limit may be hard-coded elsewhere; read it from Config.
 */
import type { TemperatureUnit } from './domain';

export interface Breakpoints {
  /** Min viewport width (px) for the wide layout. */
  readonly wide: number;
  /** Min viewport width (px) for the extra-wide layout. */
  readonly extraWide: number;
}

/**
 * Largest `count` the geocoding provider documents (provider-verification.md item 6). The search result limit may not
 * exceed it.
 */
export const MAX_SEARCH_RESULT_LIMIT = 100;

/**
 * Largest `forecast_days` the weather provider documents (provider-verification.md item 4). `forecastDays` may not
 * exceed it.
 */
export const MAX_PROVIDER_FORECAST_DAYS = 16;

export interface Config {
  /** Weather and geocoding request timeout in ms (architecture 7 item 2). */
  readonly weatherTimeoutMs: number;
  /** App-owned location watchdog in ms (architecture 3.3). */
  readonly locationTimeoutMs: number;
  /** Forecast days requested (today plus the next two). */
  readonly forecastDays: number;
  /** Whether today counts as forecast day 1: true, the first provider day is today (provider-verification.md item 4). */
  readonly forecastIncludesToday: boolean;
  /** Favorites cap (OQ-006). Undefined means unbounded. */
  readonly maxFavorites?: number;
  /** Initial temperature unit (OQ-003, ODD-2). */
  readonly defaultTemperatureUnit: TemperatureUnit;
  /** Age in ms after which data is flagged stale (OQ-010). Undefined means disabled. */
  readonly staleAfterMs?: number;
  /** Max search candidates requested and offered; at most MAX_SEARCH_RESULT_LIMIT (the provider's documented maximum). */
  readonly searchResultLimit: number;
  /**
   * Candidates requested from the geocoder when the typed text has a "name, qualifier" form (A-Q5), so that the
   * qualifier filter has more than the shown few to choose from; the shown list is still cut to `searchResultLimit`.
   * At most MAX_SEARCH_RESULT_LIMIT; a value below `searchResultLimit` has no effect (the larger of the two is asked for).
   */
  readonly qualifiedSearchFetchLimit: number;
  /** Responsive layout widths. */
  readonly breakpoints: Breakpoints;
  /** Narrowest supported viewport width in CSS px; the layout must work down to it. */
  readonly minViewportWidthPx: number;
  /** Search input length cap in characters. */
  readonly maxInputLength: number;
  /** Decimals kept when device coordinates are rounded for a weather request (U8). */
  readonly coordinateDecimals: number;
  /** Initial JavaScript budget, gzipped, in bytes ("200 KB" is read as 200,000 bytes, the stricter reading). */
  readonly bundleBudgetGzipBytes: number;
  /** Data-source attribution text. Empty until provider terms are verified (TASK-001). */
  attributionText: string;
}

export type ConfigOverrides = Partial<Omit<Config, 'breakpoints'>> & {
  readonly breakpoints?: Partial<Breakpoints>;
};

export const DEFAULT_CONFIG: Config = Object.freeze({
  weatherTimeoutMs: 10_000,
  locationTimeoutMs: 10_000,
  forecastDays: 3,
  forecastIncludesToday: true,
  maxFavorites: undefined,
  defaultTemperatureUnit: 'C',
  staleAfterMs: undefined,
  searchResultLimit: 5,
  qualifiedSearchFetchLimit: 20,
  breakpoints: Object.freeze({ wide: 768, extraWide: 1024 }),
  minViewportWidthPx: 320,
  maxInputLength: 100,
  coordinateDecimals: 2,
  bundleBudgetGzipBytes: 200_000,
  attributionText: '',
});

/** Copy of `source` without keys whose value is undefined. Keeps the key types. */
function withoutUndefined<T extends object>(source: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(source) as Array<keyof T>) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid config: ${name} must be a positive integer (received ${String(value)}).`);
  }
}

function requireNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid config: ${name} must be a non-negative integer (received ${String(value)}).`,
    );
  }
}

function requireAtMost(name: string, value: number, max: number): void {
  if (value > max) throw new Error(`Invalid config: ${name} must be at most ${max} (received ${String(value)}).`);
}

/**
 * Reject values that would break timers or limits (NaN, Infinity, negative,
 * zero, fractional). Config is built once at startup, so a bad value is a
 * programming error and throws a clear Error rather than being silently used.
 */
function validateConfig(config: Config): void {
  requirePositiveInteger('weatherTimeoutMs', config.weatherTimeoutMs);
  requirePositiveInteger('locationTimeoutMs', config.locationTimeoutMs);
  requirePositiveInteger('forecastDays', config.forecastDays);
  requireAtMost('forecastDays', config.forecastDays, MAX_PROVIDER_FORECAST_DAYS);
  requirePositiveInteger('searchResultLimit', config.searchResultLimit);
  requireAtMost('searchResultLimit', config.searchResultLimit, MAX_SEARCH_RESULT_LIMIT);
  requirePositiveInteger('qualifiedSearchFetchLimit', config.qualifiedSearchFetchLimit);
  requireAtMost('qualifiedSearchFetchLimit', config.qualifiedSearchFetchLimit, MAX_SEARCH_RESULT_LIMIT);
  requirePositiveInteger('maxInputLength', config.maxInputLength);
  requirePositiveInteger('minViewportWidthPx', config.minViewportWidthPx);
  requireNonNegativeInteger('coordinateDecimals', config.coordinateDecimals);
  requireAtMost('coordinateDecimals', config.coordinateDecimals, 6);
  requirePositiveInteger('bundleBudgetGzipBytes', config.bundleBudgetGzipBytes);
  requirePositiveInteger('breakpoints.wide', config.breakpoints.wide);
  requirePositiveInteger('breakpoints.extraWide', config.breakpoints.extraWide);
  if (config.breakpoints.wide >= config.breakpoints.extraWide) {
    throw new Error('Invalid config: breakpoints.wide must be smaller than breakpoints.extraWide.');
  }
  if (config.minViewportWidthPx >= config.breakpoints.wide) {
    throw new Error('Invalid config: minViewportWidthPx must be smaller than breakpoints.wide.');
  }
  // Optional limits: undefined means unbounded / disabled, anything else must be sane.
  if (config.maxFavorites !== undefined) requirePositiveInteger('maxFavorites', config.maxFavorites);
  if (config.staleAfterMs !== undefined) requirePositiveInteger('staleAfterMs', config.staleAfterMs);
}

/**
 * Build a Config from the defaults plus overrides. Undefined override values,
 * including undefined breakpoint entries, are ignored so they cannot erase a
 * default. Throws an Error naming the key if a numeric value is invalid.
 */
export function createConfig(overrides: ConfigOverrides = {}): Config {
  const { breakpoints, ...rest } = overrides;
  const config: Config = Object.freeze({
    ...DEFAULT_CONFIG,
    ...withoutUndefined(rest),
    breakpoints: Object.freeze({
      ...DEFAULT_CONFIG.breakpoints,
      ...(breakpoints === undefined ? {} : withoutUndefined(breakpoints)),
    }),
  });
  validateConfig(config);
  return config;
}

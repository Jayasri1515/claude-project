/**
 * Config (C12, architecture 4.12). A single typed object for values the
 * requirements leave TBD. The defaults below are the architecture's recommended
 * defaults (not requirements); `breakpoints` and `maxInputLength` are the
 * Planner's unconfirmed proposals (impl-plan Section 3, TASK-002).
 * No timeout or limit may be hard-coded elsewhere; read it from Config.
 */
import type { TemperatureUnit } from './domain';

export interface Breakpoints {
  /** Min viewport width (px) for the wide layout. */
  readonly wide: number;
  /** Min viewport width (px) for the extra-wide layout. */
  readonly extraWide: number;
}

export interface Config {
  /** Weather request timeout in ms (OQ-008). */
  readonly weatherTimeoutMs: number;
  /** Location request timeout in ms (OQ-008). */
  readonly locationTimeoutMs: number;
  /** Forecast days requested (OQ-004). */
  readonly forecastDays: number;
  /** Whether today counts as forecast day 1 (OQ-004). */
  readonly forecastIncludesToday: boolean;
  /** Favorites cap (OQ-006). Undefined means unbounded. */
  readonly maxFavorites?: number;
  /** Initial temperature unit (OQ-003, ODD-2). */
  readonly defaultTemperatureUnit: TemperatureUnit;
  /** Age in ms after which data is flagged stale (OQ-010). Undefined means disabled. */
  readonly staleAfterMs?: number;
  /** Max search candidates offered (OQ-007). */
  readonly searchResultLimit: number;
  /** Responsive layout widths (OQ-011). Proposed, unconfirmed. */
  readonly breakpoints: Breakpoints;
  /** Search input length cap in characters (OQ-007). Proposed, unconfirmed. */
  readonly maxInputLength: number;
  /** Data-source attribution text. Empty until provider terms are verified (TASK-001). */
  readonly attributionText: string;
  /** Latest time (ms) the loading state must appear after submit/refresh (OQ-008). */
  readonly loadingIndicatorMaxDelayMs: number;
}

export type ConfigOverrides = Partial<Omit<Config, 'breakpoints'>> & {
  readonly breakpoints?: Partial<Breakpoints>;
};

export const DEFAULT_CONFIG: Config = Object.freeze({
  weatherTimeoutMs: 10_000,
  locationTimeoutMs: 10_000,
  forecastDays: 3,
  forecastIncludesToday: false,
  maxFavorites: undefined,
  defaultTemperatureUnit: 'C',
  staleAfterMs: undefined,
  searchResultLimit: 5,
  breakpoints: Object.freeze({ wide: 768, extraWide: 1024 }),
  maxInputLength: 100,
  attributionText: '',
  loadingIndicatorMaxDelayMs: 200,
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

/**
 * Reject values that would break timers or limits (NaN, Infinity, negative,
 * zero, fractional). Config is built once at startup, so a bad value is a
 * programming error and throws a clear Error rather than being silently used.
 */
function validateConfig(config: Config): void {
  requirePositiveInteger('weatherTimeoutMs', config.weatherTimeoutMs);
  requirePositiveInteger('locationTimeoutMs', config.locationTimeoutMs);
  requirePositiveInteger('forecastDays', config.forecastDays);
  requirePositiveInteger('searchResultLimit', config.searchResultLimit);
  requirePositiveInteger('maxInputLength', config.maxInputLength);
  // Optional limits: undefined means unbounded / disabled, anything else must be sane.
  if (config.maxFavorites !== undefined) requirePositiveInteger('maxFavorites', config.maxFavorites);
  if (config.staleAfterMs !== undefined) requirePositiveInteger('staleAfterMs', config.staleAfterMs);
  // A delay of 0 (show the loading state immediately) is meaningful, so allow it.
  requireNonNegativeInteger('loadingIndicatorMaxDelayMs', config.loadingIndicatorMaxDelayMs);
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

/**
 * Domain model (architecture Section 3). Platform- and provider-neutral.
 *
 * Canonical units: temperatures in degrees Celsius, humidity in percent (0-100).
 * Conversion to Fahrenheit happens only at presentation (Units & Formatting, C9).
 * Optional fields model absence (FR-018, FR-023): a missing value is `undefined`,
 * never a default such as 0.
 */
import type { AppError } from './errors';

export type TemperatureUnit = 'C' | 'F';

export const CONDITION_CODES = [
  'CLEAR',
  'PARTLY_CLOUDY',
  'CLOUDY',
  'RAIN',
  'SNOW',
  'THUNDERSTORM',
  'FOG',
  'UNKNOWN',
] as const;

/** Provider-independent weather condition. */
export type ConditionCode = (typeof CONDITION_CODES)[number];

export type LocationSource = 'search' | 'device';

export interface Location {
  /**
   * Favorites identity key (ODD-7). Derived by the identity function (TASK-008):
   * "<providerId>:<placeId>" when a place ID exists, else a normalized
   * name|admin1|country string. Never derived from coordinates.
   */
  readonly key: string;
  readonly name: string;
  readonly admin1?: string;
  readonly country?: string;
  /** Decimal degrees, required on every Location. */
  readonly latitude: number;
  /** Decimal degrees, required on every Location. */
  readonly longitude: number;
  /** IANA time zone name of the location, when known. */
  readonly timezone?: string;
  readonly placeId?: string;
  /** A 'device' location is never persisted as-is (architecture 4.7). */
  readonly source: LocationSource;
}

export interface CurrentWeather {
  /** Degrees Celsius. */
  readonly temperatureC?: number;
  /** Percent, 0-100. */
  readonly humidityPct?: number;
  readonly condition?: ConditionCode;
  /** Provider text, used as label fallback for UNKNOWN conditions. */
  readonly conditionText?: string;
  readonly observedAt?: Date;
}

export interface ForecastDay {
  /** Local calendar date at the location, ISO "YYYY-MM-DD" (no time zone component). */
  readonly date: string;
  /** Degrees Celsius. */
  readonly tempMinC?: number;
  /** Degrees Celsius. */
  readonly tempMaxC?: number;
  readonly condition?: ConditionCode;
  readonly conditionText?: string;
}

export type SectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Section<T> {
  readonly status: SectionStatus;
  readonly data?: T;
  readonly error?: AppError;
  /** Time of the last successful fetch of THIS section. */
  readonly updatedAt?: Date;
}

export interface WeatherSnapshot {
  readonly location: Location;
  readonly current: Section<CurrentWeather>;
  readonly forecast: Section<ForecastDay[]>;
}

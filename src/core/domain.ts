/**
 * Domain model (architecture Section 3). Platform- and provider-neutral.
 *
 * Canonical units: temperatures in degrees Celsius, humidity in percent (0-100).
 * Conversion to Fahrenheit happens only at presentation (Units & Formatting, C9).
 * Optional fields model absence (FR-018, FR-023): a missing value is `undefined`,
 * never a default such as 0.
 */
import type { AppError } from './errors';
import type { Result } from './result';

export type TemperatureUnit = 'C' | 'F';

export const CONDITION_CODES = [
  'CLEAR',
  'PARTLY_CLOUDY',
  'CLOUDY',
  'DRIZZLE',
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
   * Favorites identity key (architecture 3.4). Derived by the identity function: the normalized
   * name|admin1|country string, independent of the provider and its place ID. Never derived from coordinates.
   * The key of an unresolved device location is an opaque counter value.
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

export type SectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Section<T> {
  readonly status: SectionStatus;
  readonly data?: T;
  readonly error?: AppError;
  /** Time of the last successful fetch of THIS section. */
  readonly updatedAt?: Date;
}

/**
 * What the UI renders for one city's weather (impl-plan T-20, migration batch 2). `key` is the Location key of the
 * city shown, `label` its display name, `timeZone` the IANA zone from the last weather response that supplied one.
 * The two sections load together (one `WeatherProvider.get` call) but succeed or fail independently.
 */
export interface WeatherView {
  readonly key: string;
  readonly label: string;
  readonly timeZone?: string;
  readonly current: Section<Current>;
  readonly forecast: Section<Day[]>;
}

// ---------------------------------------------------------------------------------------------------------------------
// Approved domain model (architecture 3.1, impl-plan T-12). Provider- and platform-neutral.
//
// The types ABOVE this line (`Location`, `Section`, `WeatherView`) are the pre-approval model that the existing
// services, controller, UI and adapters still use; they are retired by the Phase 2+ tasks that rewrite those consumers
// (T-22 favorites, T-26 location flow, T-27 controller, T-30/T-31 adapters, T-60 UI). The weather
// data shapes `Current` and `Day` BELOW are already used by them. `Coordinates` lives here too (the location-service
// port re-exports it).
// ---------------------------------------------------------------------------------------------------------------------

/** Decimal degrees. */
export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

/**
 * A named location returned by a geocoder. The ONLY thing that can be saved as a favorite. `key` is the
 * provider-independent identity rule of architecture 3.4 (set by the favorites service, T-22).
 */
export interface Place {
  readonly key: string;
  /** Provider identifier, stored for information only; never part of the identity rule. */
  readonly providerId?: string;
  readonly name: string;
  readonly admin1?: string;
  readonly country?: string;
  /** City-level coordinates from the geocoder (U3 as approved). */
  readonly centroid: Coordinates;
  /** IANA name from the geocoder, used only before the first weather response supplies the time zone. */
  readonly timeZoneHint?: string;
}

/**
 * What the user is looking at. A device location keeps its coordinates in memory only: `deviceCoords` is never part of
 * a `Place`, so a type that accepts only `Place` (the favorites API, T-22) cannot be given device coordinates.
 */
export type SelectedLocation =
  | { readonly kind: 'place'; readonly place: Place; readonly origin: 'search' | 'favorite' }
  | { readonly kind: 'device'; readonly deviceCoords: Coordinates; readonly place?: Place };

/** Provider-independent weather condition category (`DRIZZLE` is part of `ConditionCode`). */
export type ConditionCategory = ConditionCode;

/** Current conditions. Every field may be absent and then renders as the "unavailable" label. */
export interface Current {
  /** Degrees Celsius (the canonical unit). */
  readonly tempCanonical?: number;
  /** Percent, 0-100. */
  readonly humidityPct?: number;
  readonly conditionCategory?: ConditionCategory;
  /** True by day, false by night, absent when the provider does not say. */
  readonly isDay?: boolean;
}

/** One forecast day. */
export interface Day {
  /** Calendar date at the location, "YYYY-MM-DD", taken from the provider's date strings. */
  readonly localDate: string;
  /** Degrees Celsius. */
  readonly highCanonical?: number;
  /** Degrees Celsius. */
  readonly lowCanonical?: number;
  readonly conditionCategory?: ConditionCategory;
}

/**
 * Result of one weather request. The two sections succeed or fail independently; a transport, timeout or rate-limit
 * failure fails the whole `get` instead (architecture 3.1, DR-19).
 */
export interface WeatherResult {
  /** IANA time zone from the weather response, when the provider returns one. */
  readonly timeZone?: string;
  readonly current: Result<Current, AppError>;
  readonly forecast: Result<Day[], AppError>;
}

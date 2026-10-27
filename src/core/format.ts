/**
 * Units and formatting (C9, architecture 4.9; FR-016, FR-018, FR-021, FR-030,
 * FR-042, NFR-008, AC-P-04).
 *
 * Weather data is held in canonical units (Celsius, percent); conversion to
 * Fahrenheit happens only here. A missing or non-finite value renders as the
 * "Unavailable" text, never as 0 or blank (FR-018). Dates and numbers follow
 * the device locale unless a locale is passed (ODD-11). All user-visible text
 * comes from the message table (`messages.ts`); this file holds no UI wording.
 */
import type { ForecastDay, TemperatureUnit } from './domain';
import { message } from './messages';
import type { MessageId } from './messages';

export interface FormatOptions {
  /** BCP 47 locale. Undefined uses the device locale. */
  readonly locale?: string;
}

export interface DateTimeOptions extends FormatOptions {
  /** IANA time zone. Undefined (or an invalid name) uses the device time zone. */
  readonly timeZone?: string;
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'F' ? celsiusToFahrenheit(celsius) : celsius;
}

function isUsable(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/** Nearest whole number, with negative zero normalized to 0 so "-0" never shows. */
function roundForDisplay(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

function formatWhole(value: number, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(roundForDisplay(value));
}

/** Whole-degree temperature with unit symbol, or the Unavailable text. */
export function formatTemperature(
  celsius: number | undefined,
  unit: TemperatureUnit,
  options: FormatOptions = {},
): string {
  if (!isUsable(celsius)) return message('ui.unavailable');
  const id: MessageId = unit === 'F' ? 'ui.temperatureF' : 'ui.temperatureC';
  return message(id, { value: formatWhole(convertTemperature(celsius, unit), options.locale) });
}

/** Whole-percent humidity with a percent sign, or the Unavailable text. */
export function formatHumidity(pct: number | undefined, options: FormatOptions = {}): string {
  if (!isUsable(pct)) return message('ui.unavailable');
  return message('ui.humidity', { value: formatWhole(pct, options.locale) });
}

/** "Label: value" using a label message ID. */
export function formatLabeled(labelId: MessageId, value: string): string {
  return message('ui.labeledValue', { label: message(labelId), value });
}

export function formatLabeledTemperature(
  celsius: number | undefined,
  unit: TemperatureUnit,
  options: FormatOptions = {},
): string {
  return formatLabeled('ui.label.temperature', formatTemperature(celsius, unit, options));
}

export function formatLabeledHumidity(pct: number | undefined, options: FormatOptions = {}): string {
  return formatLabeled('ui.label.humidity', formatHumidity(pct, options));
}

/** "High x, Low y" for a forecast day; each missing side shows Unavailable. */
export function formatForecastRange(
  day: Pick<ForecastDay, 'tempMaxC' | 'tempMinC'>,
  unit: TemperatureUnit,
  options: FormatOptions = {},
): string {
  return message('ui.forecastRange', {
    high: message('ui.forecastHigh', { value: formatTemperature(day.tempMaxC, unit, options) }),
    low: message('ui.forecastLow', { value: formatTemperature(day.tempMinC, unit, options) }),
  });
}

/**
 * Intl.DateTimeFormat that falls back to the device time zone when the zone
 * name is not valid, instead of throwing.
 */
function dateTimeFormat(
  locale: string | undefined,
  timeZone: string | undefined,
  fields: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { ...fields, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, fields);
  }
}

function isValidDate(date: Date | undefined): date is Date {
  return date !== undefined && !Number.isNaN(date.getTime());
}

/** Time of day (hour and minute) in the given zone, for "Last updated" text. */
export function formatTime(date: Date | undefined, options: DateTimeOptions = {}): string {
  if (!isValidDate(date)) return message('ui.unavailable');
  return dateTimeFormat(options.locale, options.timeZone, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** Date and time of day in the given zone. */
export function formatDateTime(date: Date | undefined, options: DateTimeOptions = {}): string {
  if (!isValidDate(date)) return message('ui.unavailable');
  return dateTimeFormat(options.locale, options.timeZone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A forecast day's calendar date ("YYYY-MM-DD", already local to the location).
 * It is formatted as a plain calendar date so the device time zone can never
 * shift it to a neighboring day.
 */
export function formatForecastDate(isoDate: string | undefined, options: FormatOptions = {}): string {
  const match = isoDate === undefined ? null : ISO_DATE.exec(isoDate);
  if (match === null) return message('ui.unavailable');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const instant = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day;
  if (!isRealDate) return message('ui.unavailable');
  return new Intl.DateTimeFormat(options.locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(instant);
}

/** "Last updated <time>" or the Unavailable text when no time is known. */
export function formatLastUpdated(date: Date | undefined, options: DateTimeOptions = {}): string {
  if (!isValidDate(date)) return message('ui.unavailable');
  return message('ui.lastUpdated', { time: formatTime(date, options) });
}

/** "Showing data from <time>" for a section that kept stale data. */
export function formatDataFrom(date: Date | undefined, options: DateTimeOptions = {}): string {
  if (!isValidDate(date)) return message('ui.unavailable');
  return message('ui.dataFrom', { time: formatTime(date, options) });
}

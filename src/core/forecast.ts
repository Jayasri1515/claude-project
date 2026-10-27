/**
 * Forecast shaping and last-updated helpers (architecture 3 and 4.6; FR-023,
 * FR-030, EC-011, EC-019, F-002). Pure functions, no I/O.
 */
import type { ForecastDay, Section } from './domain';

/**
 * One row of the forecast list. A missing day is an explicit 'unavailable'
 * slot rather than a ForecastDay with an invented date.
 */
export type ForecastSlot =
  | { readonly kind: 'day'; readonly day: ForecastDay }
  | { readonly kind: 'unavailable' };

/**
 * Shape a provider forecast to exactly `count` slots: extra days are dropped
 * (the first `count` kept, order preserved) and missing days are padded with
 * 'unavailable' slots at the end. `count` comes from Config.forecastDays.
 */
export function padForecast(days: readonly ForecastDay[], count: number): ForecastSlot[] {
  const wanted = Number.isInteger(count) && count > 0 ? count : 0;
  const slots: ForecastSlot[] = days.slice(0, wanted).map((day) => ({ kind: 'day', day }));
  while (slots.length < wanted) slots.push({ kind: 'unavailable' });
  return slots;
}

/** Keep at most `count` days (no padding). Used before storing a forecast. */
export function truncateForecast(days: readonly ForecastDay[], count: number): ForecastDay[] {
  const wanted = Number.isInteger(count) && count > 0 ? count : 0;
  return days.slice(0, wanted);
}

function validTime(date: Date | undefined): date is Date {
  return date !== undefined && !Number.isNaN(date.getTime());
}

/**
 * The older of the two sections' last successful fetch times, so the displayed
 * time never overstates freshness. Undefined when either section has never
 * succeeded. Equal times return that time.
 */
export function deriveLastUpdated(
  current: Pick<Section<unknown>, 'updatedAt'>,
  forecast: Pick<Section<unknown>, 'updatedAt'>,
): Date | undefined {
  const a = current.updatedAt;
  const b = forecast.updatedAt;
  if (!validTime(a) || !validTime(b)) return undefined;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Open-Meteo weather code to ConditionCode table (TASK-023).
 *
 * The codes and their descriptions are the WMO weather interpretation codes as
 * listed in the Open-Meteo forecast documentation (https://open-meteo.com/en/docs,
 * section "WMO Weather interpretation codes (WW)", checked 2026-10-27). The API
 * returns only the number; the English description comes from that table.
 *
 * ConditionCode has no drizzle or hail value, so drizzle (51-57) and freezing
 * rain (66, 67) map to RAIN, and the thunderstorm codes with hail (96, 99) map
 * to THUNDERSTORM. Any code that is not in the table maps to UNKNOWN (never
 * throws), and a missing or non-numeric code maps to nothing at all.
 */
import type { ConditionCode } from '../../core/domain';

interface WmoEntry {
  readonly condition: ConditionCode;
  readonly text: string;
}

export const WMO_CODES: Readonly<Record<number, WmoEntry>> = Object.freeze({
  0: { condition: 'CLEAR', text: 'Clear sky' },
  1: { condition: 'CLEAR', text: 'Mainly clear' },
  2: { condition: 'PARTLY_CLOUDY', text: 'Partly cloudy' },
  3: { condition: 'CLOUDY', text: 'Overcast' },
  45: { condition: 'FOG', text: 'Fog' },
  48: { condition: 'FOG', text: 'Depositing rime fog' },
  51: { condition: 'RAIN', text: 'Light drizzle' },
  53: { condition: 'RAIN', text: 'Moderate drizzle' },
  55: { condition: 'RAIN', text: 'Dense drizzle' },
  56: { condition: 'RAIN', text: 'Light freezing drizzle' },
  57: { condition: 'RAIN', text: 'Dense freezing drizzle' },
  61: { condition: 'RAIN', text: 'Slight rain' },
  63: { condition: 'RAIN', text: 'Moderate rain' },
  65: { condition: 'RAIN', text: 'Heavy rain' },
  66: { condition: 'RAIN', text: 'Light freezing rain' },
  67: { condition: 'RAIN', text: 'Heavy freezing rain' },
  71: { condition: 'SNOW', text: 'Slight snowfall' },
  73: { condition: 'SNOW', text: 'Moderate snowfall' },
  75: { condition: 'SNOW', text: 'Heavy snowfall' },
  77: { condition: 'SNOW', text: 'Snow grains' },
  80: { condition: 'RAIN', text: 'Slight rain showers' },
  81: { condition: 'RAIN', text: 'Moderate rain showers' },
  82: { condition: 'RAIN', text: 'Violent rain showers' },
  85: { condition: 'SNOW', text: 'Slight snow showers' },
  86: { condition: 'SNOW', text: 'Heavy snow showers' },
  95: { condition: 'THUNDERSTORM', text: 'Thunderstorm' },
  96: { condition: 'THUNDERSTORM', text: 'Thunderstorm with slight hail' },
  97: { condition: 'THUNDERSTORM', text: 'Heavy thunderstorm' },
  99: { condition: 'THUNDERSTORM', text: 'Thunderstorm with heavy hail' },
});

export interface MappedCondition {
  readonly condition: ConditionCode;
  /** Provider description; undefined for a code that is not in the table. */
  readonly text?: string;
}

/**
 * Map a raw `weather_code` value. Returns undefined when there is no usable
 * number (missing, null, string, NaN, fractional), so the field stays missing;
 * returns UNKNOWN for an integer that is not in the table.
 */
export function mapWeatherCode(raw: unknown): MappedCondition | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return undefined;
  const entry = Object.prototype.hasOwnProperty.call(WMO_CODES, raw) ? WMO_CODES[raw] : undefined;
  return entry === undefined ? { condition: 'UNKNOWN' } : { condition: entry.condition, text: entry.text };
}

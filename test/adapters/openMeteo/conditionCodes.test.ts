import { describe, expect, it } from 'vitest';
import { mapWeatherCode, WMO_CODES } from '../../../src/adapters/openMeteo/conditionCodes';
import { CONDITION_CODES } from '../../../src/core/domain';
import type { ConditionCode } from '../../../src/core/domain';

/**
 * The code list is the WMO table printed in the Open-Meteo forecast documentation
 * (https://open-meteo.com/en/docs, checked 2026-10-27). It is written out again here on purpose, so a code
 * dropped or re-mapped in the adapter's table is caught.
 */
const DOCUMENTED: ReadonlyArray<readonly [number, string, ConditionCode]> = [
  [0, 'Clear sky', 'CLEAR'],
  [1, 'Mainly clear', 'CLEAR'],
  [2, 'Partly cloudy', 'PARTLY_CLOUDY'],
  [3, 'Overcast', 'CLOUDY'],
  [45, 'Fog', 'FOG'],
  [48, 'Depositing rime fog', 'FOG'],
  [51, 'Light drizzle', 'RAIN'],
  [53, 'Moderate drizzle', 'RAIN'],
  [55, 'Dense drizzle', 'RAIN'],
  [56, 'Light freezing drizzle', 'RAIN'],
  [57, 'Dense freezing drizzle', 'RAIN'],
  [61, 'Slight rain', 'RAIN'],
  [63, 'Moderate rain', 'RAIN'],
  [65, 'Heavy rain', 'RAIN'],
  [66, 'Light freezing rain', 'RAIN'],
  [67, 'Heavy freezing rain', 'RAIN'],
  [71, 'Slight snowfall', 'SNOW'],
  [73, 'Moderate snowfall', 'SNOW'],
  [75, 'Heavy snowfall', 'SNOW'],
  [77, 'Snow grains', 'SNOW'],
  [80, 'Slight rain showers', 'RAIN'],
  [81, 'Moderate rain showers', 'RAIN'],
  [82, 'Violent rain showers', 'RAIN'],
  [85, 'Slight snow showers', 'SNOW'],
  [86, 'Heavy snow showers', 'SNOW'],
  [95, 'Thunderstorm', 'THUNDERSTORM'],
  [96, 'Thunderstorm with slight hail', 'THUNDERSTORM'],
  [97, 'Heavy thunderstorm', 'THUNDERSTORM'],
  [99, 'Thunderstorm with heavy hail', 'THUNDERSTORM'],
];

describe('Open-Meteo weather code table', () => {
  it.each(DOCUMENTED)('code %i (%s) maps to %s', (code, text, condition) => {
    expect(mapWeatherCode(code)).toEqual({ condition, text });
  });

  it('the table has exactly the documented codes and no others', () => {
    expect(Object.keys(WMO_CODES).map(Number).sort((a, b) => a - b)).toEqual(DOCUMENTED.map(([code]) => code));
  });

  it('every documented code maps to a real ConditionCode that is not UNKNOWN', () => {
    for (const [code] of DOCUMENTED) {
      const mapped = mapWeatherCode(code);
      expect(CONDITION_CODES).toContain(mapped?.condition);
      expect(mapped?.condition).not.toBe('UNKNOWN');
    }
  });

  it.each([4, 10, 44, 100, 1234, -1, 0.0 + 98])('undocumented integer %i maps to UNKNOWN with no text', (code) => {
    expect(mapWeatherCode(code)).toEqual({ condition: 'UNKNOWN' });
  });

  it.each([undefined, null, 'rain', '1', 1.5, Number.NaN, Number.POSITIVE_INFINITY, {}, [], true, 'constructor', '__proto__'])(
    'a missing or non-integer value (%j) maps to nothing and never throws',
    (value) => {
      expect(mapWeatherCode(value)).toBeUndefined();
    },
  );
});

/**
 * MANUAL live smoke check for the Open-Meteo adapters (npm run smoke:live). It is NOT part of `npm test`.
 *
 * It makes exactly three real HTTPS requests (one geocoding search, one current-weather request, one daily
 * forecast request) through the real adapters and checks that the real responses parse into sensible domain
 * values. It asserts shapes and ranges only, never exact weather, so it keeps passing as the weather changes.
 * Do not run it in a loop or in CI: the free API is for non-commercial use with request limits
 * (https://open-meteo.com/en/terms). Nothing is stored; the output is a short summary on the console.
 */
import { describe, expect, it } from 'vitest';
import { OpenMeteoGeocodingProvider } from '../../src/adapters/openMeteo/geocoding';
import { OpenMeteoWeatherProvider } from '../../src/adapters/openMeteo/weather';
import { CONDITION_CODES } from '../../src/core/domain';
import type { Location } from '../../src/core/domain';

const TIMEOUT_MS = 10_000;

describe('live Open-Meteo smoke (3 real requests)', () => {
  let place: Location | undefined;

  it('geocoding: searching "Berlin" returns places with coordinates', async () => {
    const result = await new OpenMeteoGeocodingProvider({ timeoutMs: TIMEOUT_MS }).search('Berlin', 3);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    place = result.value[0];
    expect(place?.name).toBe('Berlin');
    expect(place?.latitude).toBeGreaterThan(-90);
    expect(place?.timezone).toBeTruthy();
    console.log(`smoke: geocoding ok, first result ${place?.name}, ${place?.admin1 ?? '-'}, ${place?.country ?? '-'} (${place?.timezone ?? '-'})`);
  });

  it('weather: current conditions for that place are Celsius, percent and a known condition code', async () => {
    expect(place, 'the geocoding step must pass first').toBeDefined();
    if (place === undefined) return;
    const signal = new AbortController().signal;
    const result = await new OpenMeteoWeatherProvider({ timeoutMs: TIMEOUT_MS }).getCurrent(place, signal);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.temperatureC).toBeGreaterThan(-90);
    expect(result.value.temperatureC).toBeLessThan(60);
    expect(result.value.humidityPct).toBeGreaterThanOrEqual(0);
    expect(result.value.humidityPct).toBeLessThanOrEqual(100);
    expect(CONDITION_CODES).toContain(result.value.condition);
    expect(result.value.condition).not.toBe('UNKNOWN');
    expect(Math.abs((result.value.observedAt?.getTime() ?? 0) - Date.now())).toBeLessThan(3 * 60 * 60 * 1000);
    console.log(`smoke: current ok, ${result.value.temperatureC} C, ${result.value.humidityPct} %, ${result.value.condition}, observed ${result.value.observedAt?.toISOString()}`);
  });

  it('weather: a 3-day forecast after today has location-local dates and Celsius highs and lows', async () => {
    expect(place, 'the geocoding step must pass first').toBeDefined();
    if (place === undefined) return;
    const signal = new AbortController().signal;
    const result = await new OpenMeteoWeatherProvider({ timeoutMs: TIMEOUT_MS }).getForecast(place, 3, false, signal);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    for (const day of result.value) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.tempMaxC).toBeDefined();
      expect(day.tempMinC).toBeDefined();
      expect(day.tempMaxC ?? 0).toBeGreaterThanOrEqual(day.tempMinC ?? 0);
      expect(CONDITION_CODES).toContain(day.condition);
    }
    console.log(`smoke: forecast ok, dates ${result.value.map((d) => d.date).join(', ')}`);
  });
});

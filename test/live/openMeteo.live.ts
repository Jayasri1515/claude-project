/**
 * MANUAL live smoke check for the Open-Meteo adapters (npm run smoke:live). It is NOT part of `npm test`.
 *
 * It makes exactly three real HTTPS requests (one geocoding search, one current-weather request, one daily
 * forecast request, made the way the app makes it: today plus two days) through the real adapters and checks that the real responses parse into sensible domain
 * values. It asserts shapes and ranges only, never exact weather, so it keeps passing as the weather changes.
 * Do not run it in a loop or in CI: the free API is for non-commercial use with request limits
 * (https://open-meteo.com/en/terms). Nothing is stored; the output is a short summary on the console.
 */
import { describe, expect, it } from 'vitest';
import { OpenMeteoGeocodingProvider } from '../../src/adapters/openMeteo/geocoding';
import { OpenMeteoWeatherProvider } from '../../src/adapters/openMeteo/weather';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { CONDITION_CODES } from '../../src/core/domain';
import type { Location } from '../../src/core/domain';

const TIMEOUT_MS = 10_000;

/** Today's calendar date (YYYY-MM-DD) in a place's own time zone; the provider returns location-local dates. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

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
    expect(typeof result.value.isDay, 'the provider must report is_day for the day/night icons').toBe('boolean');
    expect(Math.abs((result.value.observedAt?.getTime() ?? 0) - Date.now())).toBeLessThan(3 * 60 * 60 * 1000);
    console.log(`smoke: current ok, ${result.value.temperatureC} C, ${result.value.humidityPct} %, ${result.value.condition}, observed ${result.value.observedAt?.toISOString()}`);
  });

  it('weather: the forecast as the app requests it (today plus two days) has location-local dates and Celsius highs and lows', async () => {
    expect(place, 'the geocoding step must pass first').toBeDefined();
    if (place === undefined) return;
    expect(DEFAULT_CONFIG.forecastIncludesToday, 'the smoke test mirrors the app default').toBe(true);
    const zone = place.timezone;
    expect(zone, 'the place must carry its time zone').toBeTruthy();
    if (zone === undefined) return;
    const signal = new AbortController().signal;
    const todayBefore = todayIn(zone);
    const result = await new OpenMeteoWeatherProvider({ timeoutMs: TIMEOUT_MS }).getForecast(
      place,
      DEFAULT_CONFIG.forecastDays,
      DEFAULT_CONFIG.forecastIncludesToday,
      signal,
    );
    const todayAfter = todayIn(zone);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(DEFAULT_CONFIG.forecastDays);
    // The first day is today in the place's own zone (either side of a midnight rollover during the request).
    expect([todayBefore, todayAfter]).toContain(result.value[0]?.date);
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

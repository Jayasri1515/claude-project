/**
 * MANUAL live smoke check for the Open-Meteo adapters (npm run smoke:live). It is NOT part of `npm test`.
 *
 * It makes exactly three real HTTPS requests (one geocoding search, then one `WeatherProvider.get`, which sends one
 * current-weather request and one daily forecast request, made the way the app makes them: the geocoded place's
 * coordinates, today plus two days) through the real adapters and checks that the real responses parse into sensible domain
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

  it('weather: one get as the app makes it (today plus two days) has Celsius current values and location-local forecast dates', async () => {
    expect(place, 'the geocoding step must pass first').toBeDefined();
    if (place === undefined) return;
    expect(DEFAULT_CONFIG.forecastIncludesToday, 'the smoke test mirrors the app default').toBe(true);
    const zone = place.timezone;
    expect(zone, 'the place must carry its time zone').toBeTruthy();
    if (zone === undefined) return;
    const signal = new AbortController().signal;
    const todayBefore = todayIn(zone);
    // The adapter reads days and "includes today" from the same Config defaults the app passes it (composition).
    const provider = new OpenMeteoWeatherProvider({
      timeoutMs: TIMEOUT_MS,
      coordinateDecimals: DEFAULT_CONFIG.coordinateDecimals,
      forecastDays: DEFAULT_CONFIG.forecastDays,
      forecastIncludesToday: DEFAULT_CONFIG.forecastIncludesToday,
    });
    const result = await provider.get({ lat: place.latitude, lon: place.longitude }, signal);
    const todayAfter = todayIn(zone);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeZone, 'the response must carry its time zone').toBeTruthy();

    const { current, forecast } = result.value;
    expect(current.ok, JSON.stringify(current)).toBe(true);
    if (!current.ok) return;
    expect(current.value.tempCanonical).toBeGreaterThan(-90);
    expect(current.value.tempCanonical).toBeLessThan(60);
    expect(current.value.humidityPct).toBeGreaterThanOrEqual(0);
    expect(current.value.humidityPct).toBeLessThanOrEqual(100);
    expect(CONDITION_CODES).toContain(current.value.conditionCategory);
    expect(current.value.conditionCategory).not.toBe('UNKNOWN');
    expect(typeof current.value.isDay, 'the provider must report is_day for the day/night icons').toBe('boolean');
    console.log(`smoke: current ok, ${current.value.tempCanonical} C, ${current.value.humidityPct} %, ${current.value.conditionCategory}`);

    expect(forecast.ok, JSON.stringify(forecast)).toBe(true);
    if (!forecast.ok) return;
    expect(forecast.value).toHaveLength(DEFAULT_CONFIG.forecastDays);
    // The first day is today in the place's own zone (either side of a midnight rollover during the request).
    expect([todayBefore, todayAfter]).toContain(forecast.value[0]?.localDate);
    for (const day of forecast.value) {
      expect(day.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.highCanonical).toBeDefined();
      expect(day.lowCanonical).toBeDefined();
      expect(day.highCanonical ?? 0).toBeGreaterThanOrEqual(day.lowCanonical ?? 0);
      expect(CONDITION_CODES).toContain(day.conditionCategory);
    }
    console.log(`smoke: forecast ok, dates ${forecast.value.map((d) => d.localDate).join(', ')}, zone ${result.value.timeZone ?? '-'}`);
  });
});

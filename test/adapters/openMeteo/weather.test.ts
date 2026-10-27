import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COORDINATE_DECIMALS,
  FORECAST_URL,
  OpenMeteoWeatherProvider,
  roundCoordinate,
} from '../../../src/adapters/openMeteo/weather';
import type { Location } from '../../../src/core/domain';
import { formatForecastDate, formatTime } from '../../../src/core/format';
import type { AppError } from '../../../src/core/errors';
import type { Result } from '../../../src/core/result';
import {
  abortableHang,
  fixtureJson,
  fixtureResponse,
  fixtureText,
  jsonResponse,
  neverSettles,
  stubFetch,
} from '../../support/openMeteo';

/**
 * TASK-023. Recorded real responses (test/fixtures/openmeteo, see manifest.json) or small edits of them.
 * Nothing calls the live API: `fetch` is always a stub.
 */
const berlin: Location = {
  key: 'open-meteo:2950159',
  name: 'Berlin',
  latitude: 52.52437,
  longitude: 13.41053,
  placeId: '2950159',
  source: 'search',
};

const signal = (): AbortSignal => new AbortController().signal;
const codeOf = <T>(result: Result<T, AppError>): string | undefined => (result.ok ? undefined : result.error.code);

/** The recorded current response with `patch` merged into its `current` block. */
function currentWith(patch: Record<string, unknown>, top: Record<string, unknown> = {}): Record<string, unknown> {
  const body = fixtureJson('forecast-current.json');
  return { ...body, ...top, current: { ...(body['current'] as Record<string, unknown>), ...patch } };
}

/** The recorded daily response with `daily` columns replaced. */
function dailyWith(patch: Record<string, unknown>, top: Record<string, unknown> = {}): Record<string, unknown> {
  const body = fixtureJson('forecast-daily.json');
  return { ...body, ...top, daily: { ...(body['daily'] as Record<string, unknown>), ...patch } };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('getCurrent: recorded response', () => {
  it('normalizes the real Berlin response (Celsius, percent, condition, instant)', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, signal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.temperatureC).toBe(9.5);
    expect(result.value.humidityPct).toBe(74);
    expect(result.value.condition).toBe('CLEAR'); // WMO 1, mainly clear
    expect(result.value.conditionText).toBe('Mainly clear');
    // "2026-10-26T19:45" in a zone at UTC+1 (utc_offset_seconds 3600) is 18:45 UTC.
    expect(result.value.observedAt?.toISOString()).toBe('2026-10-26T18:45:00.000Z');
  });
});

describe('getCurrent: missing fields stay undefined (never 0)', () => {
  const get = async (body: unknown) => {
    const { fetch } = stubFetch(() => jsonResponse(body));
    return new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, signal());
  };

  it('no temperature', async () => {
    const result = await get(currentWith({ temperature_2m: undefined }));
    expect(result.ok && result.value).not.toHaveProperty('temperatureC');
    expect(result.ok && result.value.humidityPct).toBe(74);
  });

  it('null humidity (JSON null)', async () => {
    const result = await get(currentWith({ relative_humidity_2m: null }));
    expect(result.ok && result.value).not.toHaveProperty('humidityPct');
    expect(result.ok && result.value.temperatureC).toBe(9.5);
  });

  it('no weather code: no condition and no text', async () => {
    const result = await get(currentWith({ weather_code: undefined }));
    expect(result.ok && result.value).not.toHaveProperty('condition');
    expect(result.ok && result.value).not.toHaveProperty('conditionText');
  });

  it('a current block with nothing in it is an empty CurrentWeather, not an error', async () => {
    const result = await get({ ...fixtureJson('forecast-current.json'), current: {} });
    expect(result).toEqual({ ok: true, value: {} });
  });

  it('keeps a real 0 degrees and 0 percent (zero is a value, not missing)', async () => {
    const result = await get(currentWith({ temperature_2m: 0, relative_humidity_2m: 0 }));
    expect(result.ok && [result.value.temperatureC, result.value.humidityPct]).toEqual([0, 0]);
  });

  it.each([
    ['string temperature', { temperature_2m: '9.5' }, 'temperatureC'],
    ['NaN-like temperature', { temperature_2m: 'NaN' }, 'temperatureC'],
    ['humidity above 100', { relative_humidity_2m: 140 }, 'humidityPct'],
    ['negative humidity', { relative_humidity_2m: -1 }, 'humidityPct'],
    ['fractional weather code', { weather_code: 1.5 }, 'condition'],
    ['string weather code', { weather_code: '1' }, 'condition'],
  ])('%s is dropped', async (_label, patch, field) => {
    const result = await get(currentWith(patch));
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).not.toHaveProperty(field);
  });

  it('no usable time or UTC offset: observedAt is undefined (the instant cannot be known)', async () => {
    const noTime = await get(currentWith({ time: undefined }));
    expect(noTime.ok && noTime.value).not.toHaveProperty('observedAt');
    const badTime = await get(currentWith({ time: 'yesterday' }));
    expect(badTime.ok && badTime.value).not.toHaveProperty('observedAt');
    const withoutOffset = fixtureJson('forecast-current.json');
    delete withoutOffset['utc_offset_seconds'];
    const noOffset = await get(withoutOffset);
    expect(noOffset.ok && noOffset.value).not.toHaveProperty('observedAt');
    expect(noOffset.ok && noOffset.value.temperatureC).toBe(9.5);
  });

  it('uses the response utc_offset_seconds (the location time zone), not the device time zone', async () => {
    const tokyo = await get(currentWith({ time: '2026-10-26T19:45' }, { utc_offset_seconds: 32_400, timezone: 'Asia/Tokyo' }));
    expect(tokyo.ok && tokyo.value.observedAt?.toISOString()).toBe('2026-10-26T10:45:00.000Z');
    const newYork = await get(currentWith({ time: '2026-10-26T19:45' }, { utc_offset_seconds: -14_400 }));
    expect(newYork.ok && newYork.value.observedAt?.toISOString()).toBe('2026-10-26T23:45:00.000Z');
  });

  // L5: offsets that are not whole hours, and the two extremes either side of the date line.
  // `local` is the stamp the provider sends (the location's wall clock); `utc` is the real instant.
  it.each([
    ['UTC+5:30 (India)', 19_800, 'Asia/Kolkata', '2026-10-26T19:45', '2026-10-26T14:15:00.000Z', '7:45 PM'],
    ['UTC+5:45 (Nepal)', 20_700, 'Asia/Kathmandu', '2026-10-26T19:45', '2026-10-26T14:00:00.000Z', '7:45 PM'],
    // December, so Newfoundland is on standard time (UTC-3:30), not daylight time.
    ['UTC-3:30 (Newfoundland, standard time)', -12_600, 'America/St_Johns', '2026-12-10T19:45', '2026-12-10T23:15:00.000Z', '7:45 PM'],
    // The local day is AHEAD of UTC by one calendar day at +14:00 ...
    ['UTC+14:00 (Kiritimati), local 01:15', 50_400, 'Pacific/Kiritimati', '2026-10-26T01:15', '2026-10-25T11:15:00.000Z', '1:15 AM'],
    // ... and BEHIND it by a calendar day at -12:00.
    ['UTC-12:00 (Baker Island), local 20:00', -43_200, 'Etc/GMT+12', '2026-10-26T20:00', '2026-10-27T08:00:00.000Z', '8:00 PM'],
    // The same wall-clock stamp at both extremes is 26 hours apart.
    ['UTC+14:00, local 20:00', 50_400, 'Pacific/Kiritimati', '2026-10-26T20:00', '2026-10-26T06:00:00.000Z', '8:00 PM'],
  ])('%s: observedAt is the real instant', async (_label, offset, zone, local, utcIso, shownLocal) => {
    const result = await get(currentWith({ time: local }, { utc_offset_seconds: offset, timezone: zone }));
    expect(result.ok && result.value.observedAt?.toISOString()).toBe(utcIso);
    // Shown in the location's own zone it reads as the stamp the provider sent (no device-zone drift).
    expect(formatTime(result.ok ? result.value.observedAt : undefined, { locale: 'en-US', timeZone: zone })).toBe(shownLocal);
  });

  it('the two date-line extremes are 26 hours apart for the same wall-clock stamp', async () => {
    const east = await get(currentWith({ time: '2026-10-26T12:00' }, { utc_offset_seconds: 50_400 }));
    const west = await get(currentWith({ time: '2026-10-26T12:00' }, { utc_offset_seconds: -43_200 }));
    const eastMs = east.ok ? east.value.observedAt?.getTime() : undefined;
    const westMs = west.ok ? west.value.observedAt?.getTime() : undefined;
    expect(eastMs).toBeDefined();
    expect(westMs).toBeDefined();
    expect((westMs ?? 0) - (eastMs ?? 0)).toBe(26 * 3_600_000);
  });

  it('a stamp with seconds is accepted and a stamp with a trailing zone designator is not guessed at', async () => {
    const withSeconds = await get(currentWith({ time: '2026-10-26T19:45:30' }, { utc_offset_seconds: 19_800 }));
    expect(withSeconds.ok && withSeconds.value.observedAt?.toISOString()).toBe('2026-10-26T14:15:30.000Z');
    const zoned = await get(currentWith({ time: '2026-10-26T19:45Z' }, { utc_offset_seconds: 19_800 }));
    expect(zoned.ok && zoned.value).not.toHaveProperty('observedAt');
  });
});

describe('getForecast: calendar dates are the location dates whatever its UTC offset (L5)', () => {
  it.each([
    ['UTC+5:45', 20_700, 'Asia/Kathmandu'],
    ['UTC+14:00', 50_400, 'Pacific/Kiritimati'],
    ['UTC-12:00', -43_200, 'Etc/GMT+12'],
  ])('%s: dates are passed through unchanged', async (_label, offset, zone) => {
    const body = dailyWith(
      { time: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'] },
      { utc_offset_seconds: offset, timezone: zone },
    );
    const { fetch } = stubFetch(() => jsonResponse(body));
    const withToday = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, true, signal());
    expect(withToday.ok && withToday.value.map((d) => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    const withoutToday = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, false, signal());
    expect(withoutToday.ok && withoutToday.value.map((d) => d.date)).toEqual(['2026-10-27', '2026-10-28', '2026-10-29']);
    // Formatting a date is also independent of any zone.
    expect(formatForecastDate('2026-10-27', { locale: 'en-US' })).toBe('Tue, Oct 27');
  });
});

describe('condition codes in responses', () => {
  it('an unknown code becomes UNKNOWN without text and does not throw', async () => {
    const { fetch } = stubFetch(() => jsonResponse(currentWith({ weather_code: 1234 })));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, signal());
    expect(result.ok && result.value.condition).toBe('UNKNOWN');
    expect(result.ok && result.value).not.toHaveProperty('conditionText');
  });

  it('an unknown code in the forecast becomes UNKNOWN for that day only', async () => {
    const { fetch } = stubFetch(() => jsonResponse(dailyWith({ weather_code: [3, 4242, 61, 61] })));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, false, signal());
    expect(result.ok && result.value.map((d) => d.condition)).toEqual(['UNKNOWN', 'RAIN', 'RAIN']);
  });
});

describe('getForecast: recorded response', () => {
  it('without today: 3 days after today, in the location-local dates, Celsius', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, false, signal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The recording was made on 2026-10-26 (location date); day 0 is today and is dropped.
    expect(result.value).toEqual([
      { date: '2026-10-27', tempMinC: 7.5, tempMaxC: 14.7, condition: 'CLOUDY', conditionText: 'Overcast' },
      { date: '2026-10-28', tempMinC: 7.7, tempMaxC: 14.6, condition: 'RAIN', conditionText: 'Slight rain' },
      { date: '2026-10-29', tempMinC: 7.5, tempMaxC: 12.8, condition: 'RAIN', conditionText: 'Slight rain' },
    ]);
    // One extra day is requested to make room for the dropped today.
    expect(new URL(calls[0]?.url ?? '').searchParams.get('forecast_days')).toBe('4');
  });

  it('with today: the first day is kept and exactly `days` forecast days are requested', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, true, signal());
    expect(result.ok && result.value.map((d) => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('forecast_days')).toBe('3');
  });

  it('never returns more than `days` even if the provider sends more', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 2, true, signal());
    expect(result.ok && result.value).toHaveLength(2);
  });

  it('fewer days than requested are returned as they are (the service pads them)', async () => {
    const { fetch } = stubFetch(() => jsonResponse(dailyWith({ time: ['2026-10-26', '2026-10-27'], weather_code: [3, 3], temperature_2m_max: [1, 2], temperature_2m_min: [0, 1] })));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, false, signal());
    expect(result.ok && result.value.map((d) => d.date)).toEqual(['2026-10-27']);
  });

  it('days < 1 makes no request and returns an empty list', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 0, false, signal());
    expect(result).toEqual({ ok: true, value: [] });
    expect(calls).toHaveLength(0);
  });

  it('caps forecast_days at the documented maximum of 16', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 30, false, signal());
    expect(new URL(calls[0]?.url ?? '').searchParams.get('forecast_days')).toBe('16');
  });
});

describe('getForecast: missing fields', () => {
  const forecast = async (body: unknown, includeToday = true) => {
    const { fetch } = stubFetch(() => jsonResponse(body));
    return new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, includeToday, signal());
  };

  it('null and missing temperatures and codes stay undefined, per day', async () => {
    const result = await forecast(
      dailyWith({ temperature_2m_max: [null, 14.7], temperature_2m_min: [7.5], weather_code: [null, 3, 61] }),
    );
    expect(result.ok && result.value[0]).toEqual({ date: '2026-10-26', tempMinC: 7.5 });
    expect(result.ok && result.value[1]).toEqual({ date: '2026-10-27', tempMaxC: 14.7, condition: 'CLOUDY', conditionText: 'Overcast' });
    expect(result.ok && result.value[2]).toEqual({ date: '2026-10-28', condition: 'RAIN', conditionText: 'Slight rain' });
  });

  it('absent value columns give days with a date only', async () => {
    const body = fixtureJson('forecast-daily.json');
    const result = await forecast({ ...body, daily: { time: ['2026-10-26', '2026-10-27', '2026-10-28'] } });
    expect(result.ok && result.value).toEqual([{ date: '2026-10-26' }, { date: '2026-10-27' }, { date: '2026-10-28' }]);
  });

  it('a day with an unusable date is skipped; with today dropped, position 0 is still the dropped one', async () => {
    const result = await forecast(dailyWith({ time: ['2026-10-26', 'soon', '2026-10-28', '2026-10-29'] }), false);
    expect(result.ok && result.value.map((d) => d.date)).toEqual(['2026-10-28', '2026-10-29']);
    const first = await forecast(dailyWith({ time: ['not a date', '2026-10-27', '2026-10-28', '2026-10-29'] }), false);
    expect(first.ok && first.value.map((d) => d.date)).toEqual(['2026-10-27', '2026-10-28', '2026-10-29']);
  });
});

describe('units are Celsius and percent, or the response is rejected', () => {
  it('a response that reports Fahrenheit for the current temperature is rejected, not mis-labelled', async () => {
    const body = { ...fixtureJson('forecast-current.json'), current_units: { temperature_2m: '°F', relative_humidity_2m: '%' } };
    const { fetch } = stubFetch(() => jsonResponse(body));
    expect(codeOf(await new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, signal()))).toBe('SERVICE_UNAVAILABLE');
  });

  it('a response that reports Fahrenheit for the daily temperatures is rejected', async () => {
    const body = { ...fixtureJson('forecast-daily.json'), daily_units: { temperature_2m_max: '°F', temperature_2m_min: '°F' } };
    const { fetch } = stubFetch(() => jsonResponse(body));
    expect(codeOf(await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, false, signal()))).toBe('SERVICE_UNAVAILABLE');
  });

  it('asks for Celsius explicitly', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, signal());
    expect(new URL(calls[0]?.url ?? '').searchParams.get('temperature_unit')).toBe('celsius');
  });
});

describe('failures map to the error model', () => {
  const provider = (respond: Parameters<typeof stubFetch>[0]) => new OpenMeteoWeatherProvider({ fetch: stubFetch(respond).fetch });

  it.each([
    ['recorded 400 (bad variable)', () => fixtureResponse('forecast-error-400.json', 400)],
    ['recorded 400 (bad coordinates)', () => fixtureResponse('forecast-error-bad-coords.json', 400)],
    ['429 rate limit', () => jsonResponse({ error: true, reason: 'Too many requests' }, 429)],
    ['500', () => jsonResponse('', 500)],
    ['503', () => jsonResponse('', 503)],
    ['200 with error true', () => jsonResponse({ error: true, reason: 'x' })],
    ['not JSON', () => jsonResponse('<html>bad gateway</html>')],
    ['truncated JSON', () => jsonResponse(fixtureText('forecast-current.json').slice(0, 60))],
    ['null body', () => jsonResponse('null')],
    ['array body', () => jsonResponse('[]')],
    ['no current block', () => jsonResponse({ latitude: 1 })],
    ['current is a string', () => jsonResponse({ current: 'warm' })],
  ])('getCurrent: %s is SERVICE_UNAVAILABLE', async (_label, respond) => {
    const result = await provider(respond).getCurrent(berlin, signal());
    expect(codeOf(result)).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toMatch(/Too many|reason|html|Latitude/i);
  });

  it.each([
    ['recorded 400', () => fixtureResponse('forecast-error-400.json', 400)],
    ['429 rate limit', () => jsonResponse({ error: true }, 429)],
    ['not JSON', () => jsonResponse('nope')],
    ['no daily block', () => jsonResponse({ latitude: 1 })],
    ['daily.time is not an array', () => jsonResponse({ daily: { time: 'today' } })],
    ['daily is an array', () => jsonResponse({ daily: [] })],
  ])('getForecast: %s is SERVICE_UNAVAILABLE', async (_label, respond) => {
    expect(codeOf(await provider(respond).getForecast(berlin, 3, false, signal()))).toBe('SERVICE_UNAVAILABLE');
  });

  it('a network failure is NETWORK for both calls', async () => {
    const p = provider(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(codeOf(await p.getCurrent(berlin, signal()))).toBe('NETWORK');
    expect(codeOf(await p.getForecast(berlin, 3, false, signal()))).toBe('NETWORK');
  });

  it.each([
    ['NaN latitude', { ...berlin, latitude: Number.NaN }],
    ['Infinite longitude', { ...berlin, longitude: Number.POSITIVE_INFINITY }],
  ])('%s makes no request and fails cleanly', async (_label, location) => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const p = new OpenMeteoWeatherProvider({ fetch });
    expect(codeOf(await p.getCurrent(location, signal()))).toBe('SERVICE_UNAVAILABLE');
    expect(codeOf(await p.getForecast(location, 3, false, signal()))).toBe('SERVICE_UNAVAILABLE');
    expect(calls).toHaveLength(0);
  });

  it('no automatic retry: one failed request is one fetch call', async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse('', 503));
    await new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, signal());
    expect(calls).toHaveLength(1);
  });
});

describe('abort and timeout', () => {
  it('an already-aborted signal makes no request', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const controller = new AbortController();
    controller.abort();
    const p = new OpenMeteoWeatherProvider({ fetch });
    expect((await p.getCurrent(berlin, controller.signal)).ok).toBe(false);
    expect((await p.getForecast(berlin, 3, false, controller.signal)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('aborting mid-request settles both calls and signals the fetch', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const { fetch } = stubFetch((call) => {
      seen.push(call.init.signal ?? undefined);
      return abortableHang(call.init);
    });
    const controller = new AbortController();
    const p = new OpenMeteoWeatherProvider({ fetch });
    const current = p.getCurrent(berlin, controller.signal);
    const forecast = p.getForecast(berlin, 3, false, controller.signal);
    controller.abort();
    expect((await current).ok).toBe(false);
    expect((await forecast).ok).toBe(false);
    expect(seen.every((s) => s?.aborted === true)).toBe(true);
  });

  it('aborting settles even when the fetch ignores the signal', async () => {
    const { fetch } = stubFetch(() => neverSettles());
    const controller = new AbortController();
    const pending = new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, controller.signal);
    controller.abort();
    expect((await pending).ok).toBe(false);
  });

  it('aborting while the body is being read also settles', async () => {
    const hangingBody = {
      ok: true,
      json: () => new Promise<unknown>(() => undefined),
    } as unknown as Response;
    const controller = new AbortController();
    const pending = new OpenMeteoWeatherProvider({ fetch: () => Promise.resolve(hangingBody) }).getCurrent(berlin, controller.signal);
    await Promise.resolve();
    controller.abort();
    expect((await pending).ok).toBe(false);
  });

  it('a request that outlives timeoutMs is TIMEOUT for both calls', async () => {
    vi.useFakeTimers();
    const { fetch } = stubFetch((call) => abortableHang(call.init));
    const p = new OpenMeteoWeatherProvider({ fetch, timeoutMs: 10_000 });
    const current = p.getCurrent(berlin, signal());
    const forecast = p.getForecast(berlin, 3, false, signal());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(codeOf(await current)).toBe('TIMEOUT');
    expect(codeOf(await forecast)).toBe('TIMEOUT');
  });

  it('a fast response leaves no timer running', async () => {
    vi.useFakeTimers();
    const { fetch } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const result = await new OpenMeteoWeatherProvider({ fetch, timeoutMs: 10_000 }).getCurrent(berlin, signal());
    expect(result.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('request construction (HTTPS only, no key, encoded values)', () => {
  it('getCurrent: documented host, path and parameters; plain GET; no key', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getCurrent(berlin, signal());
    const call = calls[0];
    expect(call?.url.startsWith(`${FORECAST_URL}?`)).toBe(true);
    const url = new URL(call?.url ?? '');
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('api.open-meteo.com');
    expect(url.pathname).toBe('/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '52.52', // 52.52437 rounded to 2 decimals (L2)
      longitude: '13.41', // 13.41053 rounded to 2 decimals (L2)
      timezone: 'auto',
      temperature_unit: 'celsius',
      current: 'temperature_2m,relative_humidity_2m,weather_code',
    });
    expect(call?.init.method).toBe('GET');
    expect(call?.init.headers).toBeUndefined();
    expect(call?.init.credentials).toBe('omit');
    expect(call?.init.referrerPolicy).toBe('no-referrer');
    expect(call?.url).not.toMatch(/api[_-]?key|apikey|token|secret/i);
  });

  it('getForecast: documented parameters, daily variables, timezone=auto', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getForecast(berlin, 3, false, signal());
    const url = new URL(calls[0]?.url ?? '');
    expect(url.protocol).toBe('https:');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '52.52',
      longitude: '13.41',
      timezone: 'auto',
      temperature_unit: 'celsius',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      forecast_days: '4',
    });
  });

  it('negative coordinates are sent as plain signed numbers, rounded to 2 decimals', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getCurrent({ ...berlin, latitude: -33.8688, longitude: -151.2093 }, signal());
    const params = new URL(calls[0]?.url ?? '').searchParams;
    expect([params.get('latitude'), params.get('longitude')]).toEqual(['-33.87', '-151.21']);
  });

  it('nothing from the Location other than its coordinates is sent (no name, no key)', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getCurrent({ ...berlin, name: 'A&b=c#x', key: 'k' }, signal());
    expect(calls[0]?.url).not.toContain('A%26b');
    expect(calls[0]?.url).not.toContain('Berlin');
  });
});

describe('coordinates are rounded to 2 decimals before they are sent (L2)', () => {
  it('uses 2 decimals', () => {
    expect(COORDINATE_DECIMALS).toBe(2);
  });

  it.each([
    [52.52437, 52.52],
    [13.41053, 13.41],
    [52.525, 52.53],
    [0.125, 0.13], // an exactly representable half: away from zero
    [-0.125, -0.13], // symmetric for negative values (Math.round alone gives -0.12)
    [-33.8688, -33.87],
    [-151.2093, -151.21],
    [0.004, 0],
    [-0.004, 0], // never "-0"
    [0, 0],
    [-0, 0],
    [12, 12], // whole numbers and values already at 2 decimals are unchanged
    [12.3, 12.3],
    [-12.34, -12.34],
  ])('roundCoordinate(%s) = %s', (input, expected) => {
    const rounded = roundCoordinate(input);
    expect(rounded).toBe(expected);
    expect(Object.is(rounded, -0)).toBe(false);
  });

  it.each([
    // [latitude, longitude, sent latitude, sent longitude]
    [90, 180, '90', '180'], // upper limits stay valid
    [-90, -180, '-90', '-180'], // lower limits stay valid
    [89.999, 179.996, '90', '180'], // rounds up to, never beyond, the limit
    [-89.999, -179.996, '-90', '-180'],
    [89.994, 179.994, '89.99', '179.99'],
    [0, 0, '0', '0'],
    [-0.001, -0.004, '0', '0'], // a tiny negative value is sent as "0", not "-0"
    [0.005, -0.005, '0.01', '-0.01'],
    [-33.8688, 151.2093, '-33.87', '151.21'], // mixed signs
    [1e-7, -1e-7, '0', '0'], // would be exponent notation unrounded ("1e-7")
  ])('getCurrent sends (%s, %s) as (%s, %s)', async (lat, lon, sentLat, sentLon) => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getCurrent({ ...berlin, latitude: lat, longitude: lon }, signal());
    const params = new URL(calls[0]?.url ?? '').searchParams;
    expect([params.get('latitude'), params.get('longitude')]).toEqual([sentLat, sentLon]);
  });

  it('getForecast sends the same rounded values', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getForecast(
      { ...berlin, latitude: -33.8688, longitude: 151.2093 },
      3,
      false,
      signal(),
    );
    const params = new URL(calls[0]?.url ?? '').searchParams;
    expect([params.get('latitude'), params.get('longitude')]).toEqual(['-33.87', '151.21']);
  });

  it('does not alter the Location it was given (stored and displayed coordinates stay exact)', async () => {
    const place: Location = { ...berlin, latitude: 52.52437, longitude: 13.41053 };
    const frozen = Object.freeze({ ...place });
    const { fetch } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await new OpenMeteoWeatherProvider({ fetch }).getCurrent(frozen, signal());
    expect(frozen.latitude).toBe(52.52437);
    expect(frozen.longitude).toBe(13.41053);
    expect(frozen).toEqual(place);
  });

  it('a non-finite coordinate is still refused without a request', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const result = await new OpenMeteoWeatherProvider({ fetch }).getCurrent({ ...berlin, latitude: Number.NaN }, signal());
    expect(codeOf(result)).toBe('SERVICE_UNAVAILABLE');
    expect(calls).toHaveLength(0);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../../src/adapters/openMeteo/http';
import {
  FORECAST_URL,
  OpenMeteoWeatherProvider,
  roundCoordinate,
} from '../../../src/adapters/openMeteo/weather';
import type { OpenMeteoWeatherOptions } from '../../../src/adapters/openMeteo/weather';
import { DEFAULT_CONFIG } from '../../../src/core/config';
import type { Coordinates, Current, Day, Location } from '../../../src/core/domain';
import { formatForecastDate } from '../../../src/core/format';
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
const codeOf = <T>(result: Result<T, AppError>): string | undefined => (result.ok ? undefined : result.error.kind);
const at = (loc: Location): Coordinates => ({ lat: loc.latitude, lon: loc.longitude });

/**
 * The adapter has one method, `get` (two requests, two sections). Most of these tests look at ONE section, so the
 * shims below call `get` with the OTHER section's request answered by its valid recording. The stub then sees only the
 * request under test, and the result is that section's result (or the whole-call error when `get` fails as a whole).
 */
function isolate(fetch: FetchLike, section: 'current' | 'forecast'): FetchLike {
  return (url, init) => {
    const daily = new URL(url).searchParams.has('daily');
    if (daily === (section === 'forecast')) return fetch(url, init);
    return Promise.resolve(fixtureResponse(daily ? 'forecast-daily.json' : 'forecast-current.json'));
  };
}

async function currentOf(
  options: OpenMeteoWeatherOptions & { fetch: FetchLike },
  loc: Location = berlin,
  sig: AbortSignal = signal(),
): Promise<Result<Current, AppError>> {
  const result = await new OpenMeteoWeatherProvider({ ...options, fetch: isolate(options.fetch, 'current') }).get(at(loc), sig);
  return result.ok ? result.value.current : result;
}

async function forecastOf(
  options: OpenMeteoWeatherOptions & { fetch: FetchLike },
  days: number,
  includeToday: boolean,
  loc: Location = berlin,
  sig: AbortSignal = signal(),
): Promise<Result<Day[], AppError>> {
  const provider = new OpenMeteoWeatherProvider({
    ...options,
    fetch: isolate(options.fetch, 'forecast'),
    forecastDays: days,
    forecastIncludesToday: includeToday,
  });
  const result = await provider.get(at(loc), sig);
  return result.ok ? result.value.forecast : result;
}

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

describe('get, current section: recorded response', () => {
  it('normalizes the real Berlin response (Celsius, percent, condition, instant)', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const result = await currentOf({ fetch });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tempCanonical).toBe(9.5);
    expect(result.value.humidityPct).toBe(74);
    expect(result.value.conditionCategory).toBe('CLEAR'); // WMO 1, mainly clear
  });
});

describe('get, current section: day/night flag (is_day)', () => {
  const get = async (body: unknown) => {
    const { fetch } = stubFetch(() => jsonResponse(body));
    return currentOf({ fetch });
  };

  it('is_day 1 is day and is_day 0 is night', async () => {
    const day = await get(currentWith({ is_day: 1 }));
    const night = await get(currentWith({ is_day: 0 }));
    expect(day.ok && day.value.isDay).toBe(true);
    expect(night.ok && night.value.isDay).toBe(false);
  });

  it.each([[undefined], [null], [2], ['1'], [true]])('is_day %j leaves the flag absent (never guessed)', async (raw) => {
    const result = await get(currentWith({ is_day: raw }));
    expect(result.ok && result.value).not.toHaveProperty('isDay');
  });

  it('the recorded response carries no flag, so none is invented', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const result = await currentOf({ fetch });
    expect(result.ok && result.value).not.toHaveProperty('isDay');
  });

  it('drizzle codes are DRIZZLE in the current block and per forecast day', async () => {
    const current = await get(currentWith({ weather_code: 53 }));
    expect(current.ok && current.value.conditionCategory).toBe('DRIZZLE');
    const { fetch } = stubFetch(() => jsonResponse(dailyWith({ weather_code: [51, 61, 57, 66] })));
    const result = await forecastOf({ fetch }, 3, true);
    expect(result.ok && result.value.map((d) => d.conditionCategory)).toEqual(['DRIZZLE', 'RAIN', 'DRIZZLE']);
  });
});

describe('get, current section: missing fields stay undefined (never 0)', () => {
  const get = async (body: unknown) => {
    const { fetch } = stubFetch(() => jsonResponse(body));
    return currentOf({ fetch });
  };

  it('no temperature', async () => {
    const result = await get(currentWith({ temperature_2m: undefined }));
    expect(result.ok && result.value).not.toHaveProperty('tempCanonical');
    expect(result.ok && result.value.humidityPct).toBe(74);
  });

  it('null humidity (JSON null)', async () => {
    const result = await get(currentWith({ relative_humidity_2m: null }));
    expect(result.ok && result.value).not.toHaveProperty('humidityPct');
    expect(result.ok && result.value.tempCanonical).toBe(9.5);
  });

  it('no weather code: no condition and no text', async () => {
    const result = await get(currentWith({ weather_code: undefined }));
    expect(result.ok && result.value).not.toHaveProperty('condition');
  });

  it('a current block with nothing in it is an empty Current, not an error', async () => {
    const result = await get({ ...fixtureJson('forecast-current.json'), current: {} });
    expect(result).toEqual({ ok: true, value: {} });
  });

  it('keeps a real 0 degrees and 0 percent (zero is a value, not missing)', async () => {
    const result = await get(currentWith({ temperature_2m: 0, relative_humidity_2m: 0 }));
    expect(result.ok && [result.value.tempCanonical, result.value.humidityPct]).toEqual([0, 0]);
  });

  it.each([
    ['string temperature', { temperature_2m: '9.5' }, 'tempCanonical'],
    ['NaN-like temperature', { temperature_2m: 'NaN' }, 'tempCanonical'],
    ['humidity above 100', { relative_humidity_2m: 140 }, 'humidityPct'],
    ['negative humidity', { relative_humidity_2m: -1 }, 'humidityPct'],
    ['fractional weather code', { weather_code: 1.5 }, 'condition'],
    ['string weather code', { weather_code: '1' }, 'condition'],
  ])('%s is dropped', async (_label, patch, field) => {
    const result = await get(currentWith(patch));
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).not.toHaveProperty(field);
  });
});

describe('get, forecast section: calendar dates are the location dates whatever its UTC offset (L5)', () => {
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
    const withToday = await forecastOf({ fetch }, 3, true);
    expect(withToday.ok && withToday.value.map((d) => d.localDate)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    const withoutToday = await forecastOf({ fetch }, 3, false);
    expect(withoutToday.ok && withoutToday.value.map((d) => d.localDate)).toEqual(['2026-10-27', '2026-10-28', '2026-10-29']);
    // Formatting a date is also independent of any zone.
    expect(formatForecastDate('2026-10-27', { locale: 'en-US' })).toBe('Tue, Oct 27');
  });
});

describe('condition codes in responses', () => {
  it('an unknown code becomes UNKNOWN and does not throw', async () => {
    const { fetch } = stubFetch(() => jsonResponse(currentWith({ weather_code: 1234 })));
    const result = await currentOf({ fetch });
    expect(result.ok && result.value.conditionCategory).toBe('UNKNOWN');
  });

  it('an unknown code in the forecast becomes UNKNOWN for that day only', async () => {
    const { fetch } = stubFetch(() => jsonResponse(dailyWith({ weather_code: [3, 4242, 61, 61] })));
    const result = await forecastOf({ fetch }, 3, false);
    expect(result.ok && result.value.map((d) => d.conditionCategory)).toEqual(['UNKNOWN', 'RAIN', 'RAIN']);
  });
});

describe('get, forecast section: recorded response', () => {
  it('without today: 3 days after today, in the location-local dates, Celsius', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await forecastOf({ fetch }, 3, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The recording was made on 2026-10-26 (location date); day 0 is today and is dropped.
    expect(result.value).toEqual([
      { localDate: '2026-10-27', lowCanonical: 7.5, highCanonical: 14.7, conditionCategory: 'CLOUDY' },
      { localDate: '2026-10-28', lowCanonical: 7.7, highCanonical: 14.6, conditionCategory: 'RAIN' },
      { localDate: '2026-10-29', lowCanonical: 7.5, highCanonical: 12.8, conditionCategory: 'RAIN' },
    ]);
    // One extra day is requested to make room for the dropped today.
    expect(new URL(calls[0]?.url ?? '').searchParams.get('forecast_days')).toBe('4');
  });

  it('with today: the first day is kept and exactly `days` forecast days are requested', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await forecastOf({ fetch }, 3, true);
    expect(result.ok && result.value.map((d) => d.localDate)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('forecast_days')).toBe('3');
  });

  it('never returns more than `days` even if the provider sends more', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await forecastOf({ fetch }, 2, true);
    expect(result.ok && result.value).toHaveLength(2);
  });

  it('fewer days than requested are returned as they are (the service pads them)', async () => {
    const { fetch } = stubFetch(() => jsonResponse(dailyWith({ time: ['2026-10-26', '2026-10-27'], weather_code: [3, 3], temperature_2m_max: [1, 2], temperature_2m_min: [0, 1] })));
    const result = await forecastOf({ fetch }, 3, false);
    expect(result.ok && result.value.map((d) => d.localDate)).toEqual(['2026-10-27']);
  });

  it('days < 1 makes no request and returns an empty list', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    const result = await forecastOf({ fetch }, 0, false);
    expect(result).toEqual({ ok: true, value: [] });
    expect(calls).toHaveLength(0);
  });

  it('caps forecast_days at the documented maximum of 16', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    await forecastOf({ fetch }, 30, false);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('forecast_days')).toBe('16');
  });
});

describe('get, forecast section: missing fields', () => {
  const forecast = async (body: unknown, includeToday = true) => {
    const { fetch } = stubFetch(() => jsonResponse(body));
    return forecastOf({ fetch }, 3, includeToday);
  };

  it('null and missing temperatures and codes stay undefined, per day', async () => {
    const result = await forecast(
      dailyWith({ temperature_2m_max: [null, 14.7], temperature_2m_min: [7.5], weather_code: [null, 3, 61] }),
    );
    expect(result.ok && result.value[0]).toEqual({ localDate: '2026-10-26', lowCanonical: 7.5 });
    expect(result.ok && result.value[1]).toEqual({ localDate: '2026-10-27', highCanonical: 14.7, conditionCategory: 'CLOUDY' });
    expect(result.ok && result.value[2]).toEqual({ localDate: '2026-10-28', conditionCategory: 'RAIN' });
  });

  it('absent value columns give days with a date only', async () => {
    const body = fixtureJson('forecast-daily.json');
    const result = await forecast({ ...body, daily: { time: ['2026-10-26', '2026-10-27', '2026-10-28'] } });
    expect(result.ok && result.value).toEqual([{ localDate: '2026-10-26' }, { localDate: '2026-10-27' }, { localDate: '2026-10-28' }]);
  });

  it('a day with an unusable date is skipped; with today dropped, position 0 is still the dropped one', async () => {
    const result = await forecast(dailyWith({ time: ['2026-10-26', 'soon', '2026-10-28', '2026-10-29'] }), false);
    expect(result.ok && result.value.map((d) => d.localDate)).toEqual(['2026-10-28', '2026-10-29']);
    const first = await forecast(dailyWith({ time: ['not a date', '2026-10-27', '2026-10-28', '2026-10-29'] }), false);
    expect(first.ok && first.value.map((d) => d.localDate)).toEqual(['2026-10-27', '2026-10-28', '2026-10-29']);
  });
});

describe('units are Celsius and percent, or the response is rejected', () => {
  it('a response that reports Fahrenheit for the current temperature is rejected, not mis-labelled', async () => {
    const body = { ...fixtureJson('forecast-current.json'), current_units: { temperature_2m: '°F', relative_humidity_2m: '%' } };
    const { fetch } = stubFetch(() => jsonResponse(body));
    expect(codeOf(await currentOf({ fetch }))).toBe('invalid_response');
  });

  it('a response that reports Fahrenheit for the daily temperatures is rejected', async () => {
    const body = { ...fixtureJson('forecast-daily.json'), daily_units: { temperature_2m_max: '°F', temperature_2m_min: '°F' } };
    const { fetch } = stubFetch(() => jsonResponse(body));
    expect(codeOf(await forecastOf({ fetch }, 3, false))).toBe('invalid_response');
  });

  it('asks for Celsius explicitly', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await currentOf({ fetch });
    expect(new URL(calls[0]?.url ?? '').searchParams.get('temperature_unit')).toBe('celsius');
  });
});

describe('failures map to the error model', () => {
  const opts = (respond: Parameters<typeof stubFetch>[0]) => ({ fetch: stubFetch(respond).fetch });

  it.each([
    ['recorded 400 (bad variable)', () => fixtureResponse('forecast-error-400.json', 400)],
    ['recorded 400 (bad coordinates)', () => fixtureResponse('forecast-error-bad-coords.json', 400)],
    ['500', () => jsonResponse('', 500)],
    ['503', () => jsonResponse('', 503)],
    ['200 with error true', () => jsonResponse({ error: true, reason: 'x' })],
  ])('get, current section: %s is SERVICE_UNAVAILABLE', async (_label, respond) => {
    const result = await currentOf(opts(respond));
    expect(codeOf(result)).toBe('service');
    expect(JSON.stringify(result)).not.toMatch(/Too many|reason|html|Latitude/i);
  });

  it.each([
    ['not JSON', () => jsonResponse('<html>bad gateway</html>')],
    ['truncated JSON', () => jsonResponse(fixtureText('forecast-current.json').slice(0, 60))],
    ['null body', () => jsonResponse('null')],
    ['array body', () => jsonResponse('[]')],
    ['no current block', () => jsonResponse({ latitude: 1 })],
    ['current is a string', () => jsonResponse({ current: 'warm' })],
  ])('get, current section: %s is INVALID_RESPONSE (M-06)', async (_label, respond) => {
    const result = await currentOf(opts(respond));
    expect(codeOf(result)).toBe('invalid_response');
    expect(JSON.stringify(result)).not.toMatch(/Too many|reason|html|Latitude/i);
  });

  it.each([
    ['recorded 400', () => fixtureResponse('forecast-error-400.json', 400)],
  ])('get, forecast section: %s is SERVICE_UNAVAILABLE', async (_label, respond) => {
    expect(codeOf(await forecastOf(opts(respond), 3, false))).toBe('service');
  });

  it.each([
    ['not JSON', () => jsonResponse('nope')],
    ['no daily block', () => jsonResponse({ latitude: 1 })],
    ['daily.time is not an array', () => jsonResponse({ daily: { time: 'today' } })],
    ['daily is an array', () => jsonResponse({ daily: [] })],
  ])('get, forecast section: %s is INVALID_RESPONSE (M-06)', async (_label, respond) => {
    expect(codeOf(await forecastOf(opts(respond), 3, false))).toBe('invalid_response');
  });

  it('HTTP 429 is RATE_LIMITED for both calls and the error body never escapes', async () => {
    const p = opts(() => jsonResponse({ error: true, reason: 'Too many requests' }, 429));
    const current = await currentOf(p);
    expect(codeOf(current)).toBe('rate_limited');
    expect(JSON.stringify(current)).not.toMatch(/Too many|reason/i);
    expect(codeOf(await forecastOf(p, 3, false))).toBe('rate_limited');
  });

  it('a network failure is NETWORK for both calls', async () => {
    const p = opts(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(codeOf(await currentOf(p))).toBe('network');
    expect(codeOf(await forecastOf(p, 3, false))).toBe('network');
  });

  it.each([
    ['NaN latitude', { ...berlin, latitude: Number.NaN }],
    ['Infinite longitude', { ...berlin, longitude: Number.POSITIVE_INFINITY }],
  ])('%s makes no request and fails cleanly', async (_label, location) => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    expect(codeOf(await currentOf({ fetch }, location))).toBe('service');
    expect(codeOf(await forecastOf({ fetch }, 3, false, location))).toBe('service');
    expect(calls).toHaveLength(0);
  });

  it('no automatic retry: one failed request is one fetch call', async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse('', 503));
    await currentOf({ fetch });
    expect(calls).toHaveLength(1);
  });
});

describe('abort and timeout', () => {
  it('an already-aborted signal makes no request', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const controller = new AbortController();
    controller.abort();
    expect(codeOf(await currentOf({ fetch }, berlin, controller.signal))).toBe('aborted');
    expect(codeOf(await forecastOf({ fetch }, 3, false, berlin, controller.signal))).toBe('aborted');
    expect(calls).toHaveLength(0);
  });

  it('aborting mid-request settles both calls and signals the fetch', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const { fetch } = stubFetch((call) => {
      seen.push(call.init.signal ?? undefined);
      return abortableHang(call.init);
    });
    const controller = new AbortController();
    const current = currentOf({ fetch }, berlin, controller.signal);
    const forecast = forecastOf({ fetch }, 3, false, berlin, controller.signal);
    controller.abort();
    expect(codeOf(await current)).toBe('aborted');
    expect(codeOf(await forecast)).toBe('aborted');
    expect(seen.every((s) => s?.aborted === true)).toBe(true);
  });

  it('aborting settles even when the fetch ignores the signal', async () => {
    const { fetch } = stubFetch(() => neverSettles());
    const controller = new AbortController();
    const pending = currentOf({ fetch }, berlin, controller.signal);
    controller.abort();
    expect(codeOf(await pending)).toBe('aborted');
  });

  it('aborting while the body is being read also settles', async () => {
    const hangingBody = {
      ok: true,
      json: () => new Promise<unknown>(() => undefined),
    } as unknown as Response;
    const controller = new AbortController();
    const pending = currentOf({ fetch: () => Promise.resolve(hangingBody) }, berlin, controller.signal);
    await Promise.resolve();
    controller.abort();
    expect(codeOf(await pending)).toBe('aborted');
  });

  it('a request that outlives timeoutMs is TIMEOUT for both calls', async () => {
    vi.useFakeTimers();
    const { fetch } = stubFetch((call) => abortableHang(call.init));
    const current = currentOf({ fetch, timeoutMs: 10_000 });
    const forecast = forecastOf({ fetch, timeoutMs: 10_000 }, 3, false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(codeOf(await current)).toBe('timeout');
    expect(codeOf(await forecast)).toBe('timeout');
  });

  it('a fast response leaves no timer running', async () => {
    vi.useFakeTimers();
    const { fetch } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const result = await currentOf({ fetch, timeoutMs: 10_000 });
    expect(result.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('request construction (HTTPS only, no key, encoded values)', () => {
  it('get, current section: documented host, path and parameters; plain GET; no key', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await currentOf({ fetch });
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
      current: 'temperature_2m,relative_humidity_2m,weather_code,is_day',
    });
    expect(call?.init.method).toBe('GET');
    expect(call?.init.headers).toBeUndefined();
    expect(call?.init.credentials).toBe('omit');
    expect(call?.init.referrerPolicy).toBe('no-referrer');
    expect(call?.url).not.toMatch(/api[_-]?key|apikey|token|secret/i);
  });

  it('sends both weather requests with cache "no-store", so stale weather is never served from the HTTP cache (architecture 3.9, R10)', async () => {
    const { fetch, calls } = stubFetch((call) =>
      fixtureResponse(new URL(call.url).searchParams.has('daily') ? 'forecast-daily.json' : 'forecast-current.json'),
    );
    await new OpenMeteoWeatherProvider({ fetch, forecastDays: 3, forecastIncludesToday: true }).get(at(berlin), signal());
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.init.cache, call.url).toBe('no-store');
  });

  it('get, forecast section: documented parameters, daily variables, timezone=auto', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    await forecastOf({ fetch }, 3, false);
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
    await currentOf({ fetch }, { ...berlin, latitude: -33.8688, longitude: -151.2093 });
    const params = new URL(calls[0]?.url ?? '').searchParams;
    expect([params.get('latitude'), params.get('longitude')]).toEqual(['-33.87', '-151.21']);
  });

  it('nothing from the Location other than its coordinates is sent (no name, no key)', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await currentOf({ fetch }, { ...berlin, name: 'A&b=c#x', key: 'k' });
    expect(calls[0]?.url).not.toContain('A%26b');
    expect(calls[0]?.url).not.toContain('Berlin');
  });
});

describe('coordinates are rounded to 2 decimals before they are sent (L2)', () => {
  it('uses 2 decimals (Config.coordinateDecimals)', () => {
    expect(DEFAULT_CONFIG.coordinateDecimals).toBe(2);
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
  ])('get (current request) sends (%s, %s) as (%s, %s)', async (lat, lon, sentLat, sentLon) => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await currentOf({ fetch }, { ...berlin, latitude: lat, longitude: lon });
    const params = new URL(calls[0]?.url ?? '').searchParams;
    expect([params.get('latitude'), params.get('longitude')]).toEqual([sentLat, sentLon]);
  });

  it('get (daily request) sends the same rounded values', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-daily.json'));
    await forecastOf({ fetch }, 3, false, { ...berlin, latitude: -33.8688, longitude: 151.2093 });
    const params = new URL(calls[0]?.url ?? '').searchParams;
    expect([params.get('latitude'), params.get('longitude')]).toEqual(['-33.87', '151.21']);
  });

  it('does not alter the Location it was given (stored and displayed coordinates stay exact)', async () => {
    const place: Location = { ...berlin, latitude: 52.52437, longitude: 13.41053 };
    const frozen = Object.freeze({ ...place });
    const { fetch } = stubFetch(() => fixtureResponse('forecast-current.json'));
    await currentOf({ fetch }, frozen);
    expect(frozen.latitude).toBe(52.52437);
    expect(frozen.longitude).toBe(13.41053);
    expect(frozen).toEqual(place);
  });

  it('a non-finite coordinate is still refused without a request', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('forecast-current.json'));
    const result = await currentOf({ fetch }, { ...berlin, latitude: Number.NaN });
    expect(codeOf(result)).toBe('service');
    expect(calls).toHaveLength(0);
  });
});

describe('get (approved WeatherProvider port): two requests, two independent sections', () => {
  const coords = { lat: 52.52437, lon: 13.41053 };
  const byRequest = (call: { url: string }, current: () => Response, daily: () => Response): Response =>
    new URL(call.url).searchParams.has('daily') ? daily() : current();
  const okCurrent = () => fixtureResponse('forecast-current.json');
  const okDaily = () => fixtureResponse('forecast-daily.json');
  const failWith = (status: number) => () => jsonResponse({ error: true, reason: 'x' }, status);

  it('both ok: current, forecast and the response time zone; two parallel requests with the same signal', async () => {
    const { fetch, calls } = stubFetch((call) => byRequest(call, okCurrent, okDaily));
    const controller = new AbortController();
    const result = await new OpenMeteoWeatherProvider({ fetch }).get(coords, controller.signal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeZone).toBe('Europe/Berlin');
    expect(result.value.current).toMatchObject({ ok: true, value: { tempCanonical: 9.5, humidityPct: 74, conditionCategory: 'CLEAR' } });
    expect(result.value.forecast.ok && result.value.forecast.value.map((d) => d.localDate)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
    ]);
    expect(calls).toHaveLength(2);
    const params = calls.map((c) => new URL(c.url).searchParams);
    expect(params.filter((p) => p.has('daily'))).toHaveLength(1);
    expect(params.filter((p) => p.has('current'))).toHaveLength(1);
    for (const p of params) expect([p.get('latitude'), p.get('longitude'), p.get('timezone')]).toEqual(['52.52', '13.41', 'auto']);
    for (const c of calls) {
      expect(c.init.cache).toBe('no-store');
      expect(c.init.signal).toBeDefined();
    }
  });

  it('current fails, daily ok: the forecast is kept and the current section carries its own error', async () => {
    const { fetch } = stubFetch((call) => byRequest(call, failWith(500), okDaily));
    const result = await new OpenMeteoWeatherProvider({ fetch }).get(coords, signal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(codeOf(result.value.current)).toBe('service');
    expect(result.value.forecast.ok).toBe(true);
    expect(result.value.timeZone).toBe('Europe/Berlin');
  });

  it('daily fails, current ok: the current weather is kept and the forecast section carries its own error', async () => {
    const { fetch } = stubFetch((call) => byRequest(call, okCurrent, failWith(429)));
    const result = await new OpenMeteoWeatherProvider({ fetch }).get(coords, signal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.current.ok).toBe(true);
    expect(codeOf(result.value.forecast)).toBe('rate_limited');
  });

  it('both fail with the same kind: the whole call fails with that kind', async () => {
    const { fetch } = stubFetch(() => jsonResponse({ error: true }, 429));
    expect(codeOf(await new OpenMeteoWeatherProvider({ fetch }).get(coords, signal()))).toBe('rate_limited');
  });

  it('both fail with different kinds: the whole call fails with the first (current) error', async () => {
    const { fetch } = stubFetch((call) => byRequest(call, failWith(500), failWith(429)));
    expect(codeOf(await new OpenMeteoWeatherProvider({ fetch }).get(coords, signal()))).toBe('service');
  });

  it('a rejected fetch for both requests is a whole-call network error', async () => {
    const fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(codeOf(await new OpenMeteoWeatherProvider({ fetch }).get(coords, signal()))).toBe('network');
  });

  it('an already aborted signal settles as aborted without any request', async () => {
    const { fetch, calls } = stubFetch(() => okCurrent());
    const controller = new AbortController();
    controller.abort();
    expect(codeOf(await new OpenMeteoWeatherProvider({ fetch }).get(coords, controller.signal))).toBe('aborted');
    expect(calls).toHaveLength(0);
  });

  it('aborting mid-request settles as aborted (never network) and signals both fetches', async () => {
    const seen: Array<AbortSignal | null | undefined> = [];
    const { fetch } = stubFetch((call) => {
      seen.push(call.init.signal);
      return abortableHang(call.init);
    });
    const controller = new AbortController();
    const pending = new OpenMeteoWeatherProvider({ fetch }).get(coords, controller.signal);
    controller.abort();
    expect(codeOf(await pending)).toBe('aborted');
    expect(seen).toHaveLength(2);
  });

  it('a response that is not valid for one section gives invalid_response for that section only', async () => {
    const noCurrent = stubFetch((call) => byRequest(call, () => jsonResponse({ latitude: 1, timezone: 'Europe/Berlin' }), okDaily));
    const a = await new OpenMeteoWeatherProvider({ fetch: noCurrent.fetch }).get(coords, signal());
    expect(a.ok && codeOf(a.value.current)).toBe('invalid_response');
    expect(a.ok && a.value.forecast.ok).toBe(true);

    const noDaily = stubFetch((call) => byRequest(call, okCurrent, () => jsonResponse({ latitude: 1 })));
    const b = await new OpenMeteoWeatherProvider({ fetch: noDaily.fetch }).get(coords, signal());
    expect(b.ok && b.value.current.ok).toBe(true);
    expect(b.ok && codeOf(b.value.forecast)).toBe('invalid_response');
  });

  it('a wrong unit in one section invalidates that section only', async () => {
    const wrong = { ...fixtureJson('forecast-current.json'), current_units: { temperature_2m: 'F' } };
    const { fetch } = stubFetch((call) => byRequest(call, () => jsonResponse(wrong), okDaily));
    const result = await new OpenMeteoWeatherProvider({ fetch }).get(coords, signal());
    expect(result.ok && codeOf(result.value.current)).toBe('invalid_response');
    expect(result.ok && result.value.forecast.ok).toBe(true);
  });

  it('timeZone is left out when no response has one; a missing timezone in one response falls back to the other', async () => {
    const strip = (name: string) => {
      const body = fixtureJson(name);
      delete body['timezone'];
      return jsonResponse(body);
    };
    const none = stubFetch((call) => byRequest(call, () => strip('forecast-current.json'), () => strip('forecast-daily.json')));
    const a = await new OpenMeteoWeatherProvider({ fetch: none.fetch }).get(coords, signal());
    expect(a.ok && a.value).not.toHaveProperty('timeZone');
    const fallback = stubFetch((call) => byRequest(call, () => strip('forecast-current.json'), okDaily));
    const b = await new OpenMeteoWeatherProvider({ fetch: fallback.fetch }).get(coords, signal());
    expect(b.ok && b.value.timeZone).toBe('Europe/Berlin');
  });

  it('honours forecastDays and forecastIncludesToday', async () => {
    const { fetch, calls } = stubFetch((call) => byRequest(call, okCurrent, okDaily));
    const result = await new OpenMeteoWeatherProvider({ fetch, forecastDays: 2, forecastIncludesToday: false }).get(coords, signal());
    const daily = calls.find((c) => new URL(c.url).searchParams.has('daily'));
    expect(new URL(daily?.url ?? '').searchParams.get('forecast_days')).toBe('3');
    expect(result.ok && result.value.forecast.ok && result.value.forecast.value.map((d) => d.localDate)).toEqual(['2026-10-27', '2026-10-28']);
  });

  it('non-finite coordinates make no request and fail the whole call', async () => {
    const { fetch, calls } = stubFetch(() => okCurrent());
    expect(codeOf(await new OpenMeteoWeatherProvider({ fetch }).get({ lat: Number.NaN, lon: 1 }, signal()))).toBe('service');
    expect(calls).toHaveLength(0);
  });
});

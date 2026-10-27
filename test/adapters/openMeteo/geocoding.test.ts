import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GEOCODING_SEARCH_URL,
  OpenMeteoGeocodingProvider,
  parseGeocodingResult,
} from '../../../src/adapters/openMeteo/geocoding';
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
 * TASK-022. Every response here is a recorded real response (test/fixtures/openmeteo, see manifest.json) or a
 * small edit of one. Nothing calls the live API: `fetch` is always a stub.
 */
function codeOf<T>(result: Result<T, AppError>): string | undefined {
  return result.ok ? undefined : result.error.code;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('OpenMeteoGeocodingProvider.search: success (recorded response)', () => {
  it('maps every field of the real Berlin response to a Location', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('geocoding-berlin.json'));
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]).toEqual({
      key: 'open-meteo:2950159',
      name: 'Berlin',
      admin1: 'State of Berlin',
      country: 'Germany',
      latitude: 52.52437,
      longitude: 13.41053,
      timezone: 'Europe/Berlin',
      placeId: '2950159',
      source: 'search',
    });
    // The second and third are different places with the same name: distinct keys, so favorites cannot collide.
    expect(new Set(result.value.map((l) => l.key)).size).toBe(3);
    expect(result.value[1]?.country).toBe('United States');
  });

  it('keeps several same-name places in provider order', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('geocoding-springfield.json'));
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('Springfield', 5);
    expect(result.ok && result.value.map((l) => l.admin1)).toEqual(
      (fixtureJson('geocoding-springfield.json')['results'] as Array<{ admin1: string }>).map((r) => r.admin1),
    );
  });

  it('returns at most `limit` places even if the provider returns more', async () => {
    const { fetch } = stubFetch(() => fixtureResponse('geocoding-springfield.json'));
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('Springfield', 2);
    expect(result.ok && result.value).toHaveLength(2);
  });

  it('handles non-ASCII input and results', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('geocoding-munich-unicode.json'));
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('München', 2);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('name')).toBe('München');
    expect(result.ok && result.value.map((l) => l.name)).toEqual(['Munich', 'München']);
  });
});

describe('OpenMeteoGeocodingProvider.search: empty results (recorded response)', () => {
  it('a response with no `results` key is an empty list, not an error', async () => {
    expect(fixtureJson('geocoding-no-results.json')['results']).toBeUndefined();
    const { fetch } = stubFetch(() => fixtureResponse('geocoding-no-results.json'));
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('Zzqxjkvvwpl', 5);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('an empty `results` array is an empty list', async () => {
    const { fetch } = stubFetch(() => jsonResponse({ results: [] }));
    expect(await new OpenMeteoGeocodingProvider({ fetch }).search('x', 5)).toEqual({ ok: true, value: [] });
  });
});

describe('OpenMeteoGeocodingProvider.search: missing or unusable fields', () => {
  const berlin = (): Record<string, unknown> => (fixtureJson('geocoding-berlin.json')['results'] as Array<Record<string, unknown>>)[0] ?? {};

  it('leaves absent optional fields undefined (no admin1, no country, no timezone, no id)', () => {
    const entry = berlin();
    delete entry['admin1'];
    delete entry['country'];
    delete entry['timezone'];
    delete entry['id'];
    const location = parseGeocodingResult(entry);
    expect(location).toBeDefined();
    expect(location).not.toHaveProperty('admin1');
    expect(location).not.toHaveProperty('country');
    expect(location).not.toHaveProperty('timezone');
    expect(location).not.toHaveProperty('placeId');
    // Without a place id the key falls back to the normalized name (architecture 4.7).
    expect(location?.key).toBe('name:berlin||');
  });

  it('treats empty strings and null as absent', () => {
    const location = parseGeocodingResult({ ...berlin(), admin1: '', country: '   ', timezone: null });
    expect(location).not.toHaveProperty('admin1');
    expect(location).not.toHaveProperty('country');
    expect(location).not.toHaveProperty('timezone');
  });

  it.each([
    ['no name', { name: undefined }],
    ['empty name', { name: '  ' }],
    ['numeric name', { name: 5 }],
    ['no latitude', { latitude: undefined }],
    ['string longitude', { longitude: '13.4' }],
    ['latitude out of range', { latitude: 91 }],
    ['longitude out of range', { longitude: -181 }],
    ['NaN coordinates', { latitude: Number.NaN }],
  ])('skips a result with %s and keeps the valid ones', async (_label, patch) => {
    const results = [{ ...berlin(), ...patch }, berlin()];
    const { fetch } = stubFetch(() => jsonResponse({ results }));
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 5);
    expect(result.ok && result.value).toHaveLength(1);
  });

  it('skips entries that are not objects', async () => {
    const { fetch } = stubFetch(() => jsonResponse({ results: [null, 7, 'x', [], berlin()] }));
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 5);
    expect(result.ok && result.value).toHaveLength(1);
  });

  it('keeps provider text as plain data, unchanged (it is rendered as text by the UI)', () => {
    const location = parseGeocodingResult({ ...berlin(), name: '<img src=x onerror=alert(1)>' });
    expect(location?.name).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('OpenMeteoGeocodingProvider.search: failures map to the error model', () => {
  const search = (fetch: Parameters<typeof stubFetch>[0]) => {
    const stub = stubFetch(fetch);
    return new OpenMeteoGeocodingProvider({ fetch: stub.fetch }).search('Berlin', 5);
  };

  it('the recorded HTTP 400 error body is SERVICE_UNAVAILABLE and its reason text never escapes', async () => {
    const result = await search(() => fixtureResponse('geocoding-error-400.json', 400));
    expect(codeOf(result)).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain('Parameter count');
  });

  it.each([404, 429, 500, 502, 503])('HTTP %i is SERVICE_UNAVAILABLE', async (status) => {
    expect(codeOf(await search(() => jsonResponse({ error: true, reason: 'secret internal detail' }, status)))).toBe('SERVICE_UNAVAILABLE');
  });

  it('HTTP 200 with { error: true } is SERVICE_UNAVAILABLE', async () => {
    expect(codeOf(await search(() => jsonResponse({ error: true, reason: 'x' })))).toBe('SERVICE_UNAVAILABLE');
  });

  it.each([
    ['not JSON', '<html>gateway error</html>'],
    ['truncated JSON', fixtureText('geocoding-berlin.json').slice(0, 100)],
    ['empty body', ''],
  ])('malformed body (%s) is SERVICE_UNAVAILABLE', async (_label, body) => {
    expect(codeOf(await search(() => jsonResponse(body)))).toBe('SERVICE_UNAVAILABLE');
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'Berlin'],
    ['results is an object', { results: {} }],
    ['results is a string', { results: 'none' }],
  ])('well-formed JSON of the wrong shape (%s) is SERVICE_UNAVAILABLE', async (_label, body) => {
    expect(codeOf(await search(() => jsonResponse(JSON.stringify(body))))).toBe('SERVICE_UNAVAILABLE');
  });

  it('a network failure is NETWORK and carries no message from the exception', async () => {
    const result = await search(() => {
      throw new TypeError('Failed to fetch https://secret.example/?key=abc');
    });
    expect(codeOf(result)).toBe('NETWORK');
    expect(JSON.stringify(result)).not.toContain('secret.example');
  });

  it('a fetch that throws synchronously still returns a Result (the port never throws)', async () => {
    const provider = new OpenMeteoGeocodingProvider({
      fetch: () => {
        throw new Error('boom');
      },
    });
    expect(codeOf(await provider.search('Berlin', 5))).toBe('NETWORK');
  });
});

describe('OpenMeteoGeocodingProvider.search: abort and timeout', () => {
  it('an already-aborted signal makes no request', async () => {
    const { fetch, calls } = stubFetch(() => fixtureResponse('geocoding-berlin.json'));
    const controller = new AbortController();
    controller.abort();
    const result = await new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 5, controller.signal);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('aborting while the request is outstanding settles the call and signals the fetch', async () => {
    let seen: AbortSignal | undefined;
    const { fetch } = stubFetch((call) => {
      seen = call.init.signal ?? undefined;
      return abortableHang(call.init);
    });
    const controller = new AbortController();
    const pending = new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 5, controller.signal);
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(seen?.aborted).toBe(true);
  });

  it('aborting settles even when the fetch implementation ignores the signal', async () => {
    const { fetch } = stubFetch(() => neverSettles());
    const controller = new AbortController();
    const pending = new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 5, controller.signal);
    controller.abort();
    expect((await pending).ok).toBe(false);
  });

  it('a request that outlives timeoutMs is TIMEOUT, and the fetch is aborted', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const { fetch } = stubFetch((call) => {
      seen = call.init.signal ?? undefined;
      return abortableHang(call.init);
    });
    const pending = new OpenMeteoGeocodingProvider({ fetch, timeoutMs: 10_000 }).search('Berlin', 5);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(codeOf(await pending)).toBe('TIMEOUT');
    expect(seen?.aborted).toBe(true);
  });

  it('a fast response is not affected by the timeout and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const { fetch } = stubFetch(() => fixtureResponse('geocoding-berlin.json'));
    const result = await new OpenMeteoGeocodingProvider({ fetch, timeoutMs: 10_000 }).search('Berlin', 3);
    expect(result.ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('no automatic retry: one failed request is one fetch call', async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse({}, 503));
    await new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 5);
    expect(calls).toHaveLength(1);
  });
});

describe('OpenMeteoGeocodingProvider.search: request construction (HTTPS only, encoding, no key)', () => {
  const HOSTILE = [
    'Berlin',
    'São Paulo, Brazil',
    'a&b=c',
    'x#frag',
    '100% sure',
    'two  spaces',
    '日本語',
    '<script>alert(1)</script>',
    "O'Brien",
    'q?apikey=abc&count=1000',
    'x\u0000y',
  ];

  it.each(HOSTILE)('the query %j travels as exactly one percent-encoded `name` parameter', async (query) => {
    const { fetch, calls } = stubFetch(() => jsonResponse({}));
    await new OpenMeteoGeocodingProvider({ fetch }).search(query, 5);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.getAll('name')).toEqual([query]);
    // Nothing the user typed became a parameter or a fragment.
    expect([...url.searchParams.keys()].sort()).toEqual(['count', 'format', 'language', 'name']);
    expect(url.hash).toBe('');
    expect(url.searchParams.get('count')).toBe('5');
  });

  it('is HTTPS, on the documented host and path, with no key and a plain GET without custom headers', async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse({}));
    await new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', 5);
    const call = calls[0];
    expect(call?.url.startsWith(`${GEOCODING_SEARCH_URL}?`)).toBe(true);
    const url = new URL(call?.url ?? '');
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('geocoding-api.open-meteo.com');
    expect(url.pathname).toBe('/v1/search');
    expect(call?.init.method).toBe('GET');
    expect(call?.init.headers).toBeUndefined(); // no custom headers: a CORS simple request, no preflight
    expect(call?.init.credentials).toBe('omit');
    expect(call?.init.referrerPolicy).toBe('no-referrer');
    expect(call?.url).not.toMatch(/api[_-]?key|apikey|token|secret/i);
  });

  it.each([
    [0, '1'],
    [-3, '1'],
    [2.9, '2'],
    [1000, '100'],
    [Number.NaN, '100'],
  ])('limit %s is sent as count=%s (documented range 1 to 100)', async (limit, expected) => {
    const { fetch, calls } = stubFetch(() => jsonResponse({}));
    await new OpenMeteoGeocodingProvider({ fetch }).search('Berlin', limit);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('count')).toBe(expected);
  });

  it('has no reverse method: reverse geocoding is unavailable (A4 = No)', () => {
    expect('reverse' in new OpenMeteoGeocodingProvider({ fetch: stubFetch(() => jsonResponse({})).fetch })).toBe(false);
    expect((OpenMeteoGeocodingProvider.prototype as unknown as Record<string, unknown>)['reverse']).toBeUndefined();
  });
});

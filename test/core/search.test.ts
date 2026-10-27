import { describe, expect, it } from 'vitest';
import { createConfig } from '../../src/core/config';
import { isAbortedResult } from '../../src/core/aborted';
import { networkError, serviceUnavailable } from '../../src/core/errors';
import { SearchService } from '../../src/core/search';
import { err, ok } from '../../src/core/result';
import type { Location } from '../../src/core/domain';
import { sampleLocation } from '../fixtures/domain';
import { FakeGeocodingProvider } from '../fakes';

const place = (n: number): Location => ({ ...sampleLocation, key: `test:${n}`, placeId: String(n), name: `Place ${n}` });

function setup(overrides = {}) {
  const geocoding = new FakeGeocodingProvider();
  const service = new SearchService({ geocoding, config: createConfig(overrides) });
  return { geocoding, service };
}

describe('SearchService input validation', () => {
  it.each(['', '   ', '\t\n ', ' '])('rejects empty/whitespace %j with zero port calls', async (q) => {
    const { geocoding, service } = setup();
    const r = await service.search(q);
    expect(!r.ok && !isAbortedResult(r) && r.error.code).toBe('EMPTY_INPUT');
    expect(geocoding.searchScript.callCount).toBe(0);
  });

  it('rejects input over maxInputLength with zero port calls', async () => {
    const { geocoding, service } = setup({ maxInputLength: 10 });
    const r = await service.search('x'.repeat(11));
    // C2: a dedicated code, not NOT_FOUND.
    expect(!r.ok && !isAbortedResult(r) && r.error.code).toBe('INPUT_TOO_LONG');
    expect(!r.ok && !isAbortedResult(r) && r.error.messageKey).toBe('error.inputTooLong');
    expect(geocoding.searchScript.callCount).toBe(0);
  });

  it('accepts input exactly at maxInputLength, counting characters not UTF-16 units', async () => {
    const { geocoding, service } = setup({ maxInputLength: 3 });
    await service.search('東京都');
    expect(geocoding.searchScript.callCount).toBe(1);
    await service.search('😀😀😀');
    expect(geocoding.searchScript.callCount).toBe(2);
  });

  it('passes the query unmodified except trim, with the configured limit', async () => {
    const { geocoding, service } = setup();
    await service.search('  São Paulo, Brazil  ');
    expect(geocoding.searchScript.calls[0]?.args).toEqual(['São Paulo, Brazil', 5]);
  });

  it('passes Unicode and special characters through untouched', async () => {
    const { geocoding, service } = setup();
    await service.search("<b>Zürich</b> & O'Brien");
    expect(geocoding.searchScript.calls[0]?.args[0]).toBe("<b>Zürich</b> & O'Brien");
  });
});

describe('SearchService outcomes', () => {
  it('no matches gives NOT_FOUND', async () => {
    const { service } = setup();
    const r = await service.search('nowhere');
    expect(!r.ok && !isAbortedResult(r) && r.error.code).toBe('NOT_FOUND');
  });

  it('provider failure gives SERVICE_UNAVAILABLE (including NETWORK)', async () => {
    const { geocoding, service } = setup();
    for (const e of [serviceUnavailable(), networkError()]) {
      geocoding.searchScript.respondWith(err(e));
      const r = await service.search('x');
      expect(!r.ok && !isAbortedResult(r) && r.error.code).toBe('SERVICE_UNAVAILABLE');
    }
  });

  it('a provider that throws becomes SERVICE_UNAVAILABLE, not a rejection', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.failWith(new Error('boom'));
    const r = await service.search('x');
    expect(!r.ok && !isAbortedResult(r) && r.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('one match is auto-selected', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok([place(1)]));
    const r = await service.search('x');
    expect(r).toEqual(ok({ kind: 'selected', location: place(1) }));
  });

  it('several matches are returned for choice, limited to 5', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok([1, 2, 3, 4, 5, 6, 7].map(place)));
    const r = await service.search('x');
    expect(r.ok && !isAbortedResult(r) && r.value.kind).toBe('choose');
    if (r.ok && r.value.kind === 'choose') expect(r.value.candidates).toHaveLength(5);
  });

  it('honors a custom limit and policy', async () => {
    const geocoding = new FakeGeocodingProvider();
    geocoding.searchScript.respondWith(ok([place(1), place(2), place(3)]));
    const service = new SearchService({
      geocoding,
      config: createConfig({ searchResultLimit: 2 }),
      ambiguityPolicy: (c) => ({ kind: 'selected', location: c[0] as Location }),
    });
    const r = await service.search('x');
    expect(geocoding.searchScript.calls[0]?.args[1]).toBe(2);
    expect(r).toEqual(ok({ kind: 'selected', location: place(1) }));
  });
});

describe('SearchService abort handling', () => {
  it('passes the signal to the provider', async () => {
    const { geocoding, service } = setup();
    const ac = new AbortController();
    await service.search('x', ac.signal);
    expect(geocoding.searchScript.calls[0]?.signal).toBe(ac.signal);
  });

  it('an already-aborted signal makes no call and returns aborted', async () => {
    const { geocoding, service } = setup();
    const ac = new AbortController();
    ac.abort();
    const r = await service.search('x', ac.signal);
    expect(isAbortedResult(r)).toBe(true);
    expect(geocoding.searchScript.callCount).toBe(0);
  });

  it('a result arriving after abort is discarded as aborted', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.hold();
    const ac = new AbortController();
    const pending = service.search('x', ac.signal);
    await Promise.resolve();
    ac.abort();
    expect(geocoding.searchScript.calls[0]?.aborted).toBe(true);
    geocoding.searchScript.resolveNext(ok([place(1)]));
    expect(isAbortedResult(await pending)).toBe(true);
  });

  it('an error arriving after abort is also reported as aborted', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.hold();
    const ac = new AbortController();
    const pending = service.search('x', ac.signal);
    await Promise.resolve();
    ac.abort();
    geocoding.searchScript.resolveNext(err(serviceUnavailable()));
    expect(isAbortedResult(await pending)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createConfig } from '../../src/core/config';
import { isAbortedResult } from '../../src/core/aborted';
import { aborted, invalidResponse, isPresentable, networkError, rateLimited, serviceUnavailable, timeoutError } from '../../src/core/errors';
import { messageForError } from '../../src/core/messages';
import { normalizeWhitespace, parseQuery, SearchService } from '../../src/core/search';
import { err, ok } from '../../src/core/result';
import type { Location } from '../../src/core/domain';
import { sampleLocation } from '../fixtures/domain';
import { LegacyFakeGeocodingProvider } from '../fakes';

const place = (n: number): Location => ({ ...sampleLocation, key: `test:${n}`, placeId: String(n), name: `Place ${n}` });

function setup(overrides = {}) {
  const geocoding = new LegacyFakeGeocodingProvider();
  const service = new SearchService({ geocoding, config: createConfig(overrides) });
  return { geocoding, service };
}

describe('SearchService input validation', () => {
  it.each(['', '   ', '\t\n ', ' '])('rejects empty/whitespace %j with zero port calls', async (q) => {
    const { geocoding, service } = setup();
    const r = await service.search(q);
    expect(!r.ok && !isAbortedResult(r) && r.error.kind).toBe('empty_input');
    expect(geocoding.searchScript.callCount).toBe(0);
  });

  it('rejects input over maxInputLength with zero port calls', async () => {
    const { geocoding, service } = setup({ maxInputLength: 10 });
    const r = await service.search('x'.repeat(11));
    // INPUT_TOO_LONG has no approved kind (T-12 open question): empty_input with the provisional too-long message.
    expect(!r.ok && !isAbortedResult(r) && r.error.kind).toBe('empty_input');
    expect(!r.ok && !isAbortedResult(r) && isPresentable(r.error) && r.error.messageKey).toBe('error.inputTooLong');
    expect(geocoding.searchScript.callCount).toBe(0);
  });

  it('accepts input exactly at maxInputLength, counting characters not UTF-16 units', async () => {
    const { geocoding, service } = setup({ maxInputLength: 3 });
    await service.search('東京都');
    expect(geocoding.searchScript.callCount).toBe(1);
    await service.search('😀😀😀');
    expect(geocoding.searchScript.callCount).toBe(2);
  });

  it('passes the query unmodified except trim and whitespace collapse, with the configured limit', async () => {
    const { geocoding, service } = setup();
    await service.search('  São   Paulo\t ');
    expect(geocoding.searchScript.calls[0]?.args).toEqual(['São Paulo', 5]);
  });

  it('applies no case or diacritic change of its own to the city name', async () => {
    const { geocoding, service } = setup();
    await service.search('ZÜRICH');
    expect(geocoding.searchScript.calls[0]?.args[0]).toBe('ZÜRICH');
  });

  it('the length cap counts the trimmed text as typed, before whitespace is collapsed', async () => {
    const { geocoding, service } = setup({ maxInputLength: 10 });
    const r = await service.search('a   b   c   d'); // 13 typed characters, 7 once collapsed
    expect(!r.ok && !isAbortedResult(r) && isPresentable(r.error) && r.error.messageKey).toBe('error.inputTooLong');
    expect(geocoding.searchScript.callCount).toBe(0);
  });

  it('passes Unicode and special characters through untouched', async () => {
    const { geocoding, service } = setup();
    await service.search("<b>Zürich</b> & O'Brien");
    expect(geocoding.searchScript.calls[0]?.args[0]).toBe("<b>Zürich</b> & O'Brien");
  });
});

const located = (n: number, name: string, admin1: string | undefined, country: string | undefined): Location => ({
  ...place(n),
  name,
  ...(admin1 !== undefined ? { admin1 } : {}),
  ...(country !== undefined ? { country } : {}),
});

describe('SearchService name and qualifier handling (A-Q5)', () => {
  const paris = [
    located(1, 'Paris', 'Île-de-France', 'France'),
    located(2, 'Paris', 'Texas', 'United States'),
    located(3, 'Paris', 'Tennessee', 'United States'),
    located(4, 'Paris', undefined, undefined),
  ];
  const errorKind = (r: Awaited<ReturnType<SearchService['search']>>) => !r.ok && !isAbortedResult(r) && r.error.kind;

  it('sends only the part before the first comma to the provider, collapsed and trimmed', async () => {
    const { geocoding, service } = setup();
    await service.search('  Paris  ,   Texas ');
    expect(geocoding.searchScript.calls[0]?.args[0]).toBe('Paris');
  });

  it('splits at the FIRST comma only: later commas belong to the qualifier', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    const r = await service.search('Paris, Texas, United States');
    expect(geocoding.searchScript.calls[0]?.args[0]).toBe('Paris');
    expect(r).toEqual(ok({ kind: 'selected', location: paris[1] }));
  });

  it('asks the provider for the larger configured number with a qualifier, and for the normal limit without', async () => {
    const { geocoding, service } = setup({ searchResultLimit: 3, qualifiedSearchFetchLimit: 12 });
    await service.search('Paris');
    await service.search('Paris, France');
    expect(geocoding.searchScript.calls.map((c) => c.args[1])).toEqual([3, 12]);
  });

  it('never asks for fewer than the shown limit', async () => {
    const { geocoding, service } = setup({ searchResultLimit: 30, qualifiedSearchFetchLimit: 10 });
    await service.search('Paris, France');
    expect(geocoding.searchScript.calls[0]?.args[1]).toBe(30);
  });

  it('filters by country, case-insensitively', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    expect(await service.search('Paris, FRANCE')).toEqual(ok({ kind: 'selected', location: paris[0] }));
  });

  it('filters by region (state), case-insensitively', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    expect(await service.search('paris,  texas')).toEqual(ok({ kind: 'selected', location: paris[1] }));
  });

  it('keeps several matches in the provider order and cuts them to the shown limit', async () => {
    const { geocoding, service } = setup({ searchResultLimit: 2 });
    geocoding.searchScript.respondWith(ok([paris[1], paris[0], paris[2], paris[3]] as Location[]));
    const r = await service.search('Paris, United States');
    expect(r).toEqual(ok({ kind: 'choose', candidates: [paris[1], paris[2]] }));
  });

  it('gives not_found (M-02) when no candidate matches the qualifier', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    expect(errorKind(await service.search('Paris, Atlantis'))).toBe('not_found');
  });

  it('a candidate without region and country never matches a qualifier', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok([paris[3]] as Location[]));
    expect(errorKind(await service.search('Paris, France'))).toBe('not_found');
  });

  it('every term must match: a wrong second term removes the candidate', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    expect(errorKind(await service.search('Paris, Texas, France'))).toBe('not_found');
  });

  it('matches whole values, not parts: "Tex" does not match Texas', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    expect(errorKind(await service.search('Paris, Tex'))).toBe('not_found');
  });

  it('an empty qualifier ("Paris, ,") means no filter', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    const r = await service.search('Paris,  ,');
    expect(r.ok && !isAbortedResult(r) && r.value.kind).toBe('choose');
    expect(geocoding.searchScript.calls[0]?.args).toEqual(['Paris', 5]);
  });

  it('a qualifier with no city name is empty input and makes no request', async () => {
    const { geocoding, service } = setup();
    expect(errorKind(await service.search(' , France'))).toBe('empty_input');
    expect(geocoding.searchScript.callCount).toBe(0);
  });

  it('input without a comma is not filtered', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(ok(paris));
    const r = await service.search('Paris');
    expect(r.ok && !isAbortedResult(r) && r.value.kind === 'choose' && r.value.candidates).toHaveLength(4);
  });
});

describe('parseQuery and normalizeWhitespace', () => {
  it('collapses all whitespace kinds', () => {
    expect(normalizeWhitespace('  a \t\n b\u00a0 c ')).toBe('a b c');
  });
  it('splits at the first comma and lower-cases the qualifier terms', () => {
    expect(parseQuery('Portland ,  Oregon, USA')).toEqual({ name: 'Portland', qualifiers: ['oregon', 'usa'] });
    expect(parseQuery('Portland')).toEqual({ name: 'Portland', qualifiers: [] });
  });
});

describe('SearchService outcomes', () => {
  it('no matches gives NOT_FOUND', async () => {
    const { service } = setup();
    const r = await service.search('nowhere');
    expect(!r.ok && !isAbortedResult(r) && r.error.kind).toBe('not_found');
  });

  it('a provider service failure or timeout gives the service kind (M-03)', async () => {
    const { geocoding, service } = setup();
    for (const e of [serviceUnavailable(), timeoutError()]) {
      geocoding.searchScript.respondWith(err(e));
      const r = await service.search('x');
      expect(!r.ok && !isAbortedResult(r) && r.error.kind).toBe('service');
    }
  });

  it('a network failure keeps its own kind and the M-04 text', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(err(networkError()));
    const r = await service.search('x');
    expect(!r.ok && !isAbortedResult(r) && r.error.kind).toBe('network');
    expect(!r.ok && !isAbortedResult(r) && messageForError(r.error)).toBe(
      'Could not connect to the weather service. Check your internet connection and try again.',
    );
  });

  it('an unreadable response keeps its own kind and the M-06 text', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(err(invalidResponse()));
    const r = await service.search('x');
    expect(!r.ok && !isAbortedResult(r) && r.error.kind).toBe('invalid_response');
    expect(!r.ok && !isAbortedResult(r) && messageForError(r.error)).toBe(
      'The weather service sent a response this app could not read. Please try again later.',
    );
  });

  it('a rate-limited provider answer keeps its own kind (architecture 5.4, M-05)', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(err(rateLimited()));
    const r = await service.search('x');
    expect(!r.ok && !isAbortedResult(r) && r.error).toEqual({ kind: 'rate_limited', messageKey: 'error.rateLimited' });
  });

  it('a provider answer of kind aborted is discarded silently, never turned into a service error (DR-09)', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.respondWith(err(aborted()));
    const r = await service.search('x'); // the caller's own signal did not fire
    expect(isAbortedResult(r)).toBe(true);
  });

  it('a provider that throws becomes SERVICE_UNAVAILABLE, not a rejection', async () => {
    const { geocoding, service } = setup();
    geocoding.searchScript.failWith(new Error('boom'));
    const r = await service.search('x');
    expect(!r.ok && !isAbortedResult(r) && r.error.kind).toBe('service');
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
    const geocoding = new LegacyFakeGeocodingProvider();
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

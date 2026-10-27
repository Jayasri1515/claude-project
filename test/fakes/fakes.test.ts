import { describe, expect, it } from 'vitest';
import { notFound, serviceUnavailable } from '../../src/core/errors';
import { isAborted } from '../../src/core/ports';
import type { Clock, GeocodingProvider, KeyValueStore, LocationService, WeatherProvider } from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import { sampleCurrent, sampleForecast, sampleLocation } from '../fixtures/domain';
import {
  FakeClock,
  FakeGeocodingProvider,
  FakeLocationService,
  FakeWeatherProvider,
  InMemoryKeyValueStore,
} from './index';

describe('fakes satisfy their port types (compile-time) ', () => {
  it('assigns to the port interfaces', () => {
    const g: GeocodingProvider = new FakeGeocodingProvider();
    const w: WeatherProvider = new FakeWeatherProvider();
    const l: LocationService = new FakeLocationService();
    const k: KeyValueStore = new InMemoryKeyValueStore();
    const c: Clock = new FakeClock();
    expect([g, w, l, k, c]).toHaveLength(5);
  });
});

describe('FakeClock', () => {
  it('returns copies and can be set and advanced', () => {
    const clock = new FakeClock('2026-01-01T00:00:00Z');
    const a = clock.now();
    a.setFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    clock.advance(1000);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.000Z');
    clock.set('2030-05-05T00:00:00Z');
    expect(clock.now().getUTCFullYear()).toBe(2030);
    expect(clock.nowCalls).toBe(4);
  });
});

describe('InMemoryKeyValueStore', () => {
  it('round-trips and counts calls', () => {
    const s = new InMemoryKeyValueStore({ a: '1' });
    expect(s.get('a')).toEqual(ok('1'));
    expect(s.get('missing')).toEqual(ok(undefined));
    s.set('b', '2');
    s.remove('a');
    expect(s.get('a')).toEqual(ok(undefined));
    expect([s.getCalls, s.setCalls, s.removeCalls]).toEqual([3, 1, 1]);
  });

  it('forced failures return STORAGE_UNAVAILABLE per operation', () => {
    const s = new InMemoryKeyValueStore({ a: '1' });
    s.fail.get = true;
    const g = s.get('a');
    expect(!g.ok && g.error.code).toBe('STORAGE_UNAVAILABLE');
    s.fail.get = false;
    s.fail.set = true;
    const set = s.set('x', 'y');
    expect(!set.ok && set.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(s.data.has('x')).toBe(false);
    s.failAll();
    const rm = s.remove('a');
    expect(!rm.ok).toBe(true);
    expect(s.data.get('a')).toBe('1');
    s.failAll(false);
    expect(s.get('a').ok).toBe(true);
  });
});

describe('FakeGeocodingProvider', () => {
  it('defaults to no match, records calls and returns scripted results', async () => {
    const g = new FakeGeocodingProvider();
    expect(await g.search('x', 5)).toEqual(ok([]));
    g.searchScript.respondWith(ok([sampleLocation]));
    expect(await g.search('y', 3)).toEqual(ok([sampleLocation]));
    expect(g.searchScript.callCount).toBe(2);
    expect(g.searchScript.calls[1]?.args).toEqual(['y', 3]);
  });

  it('supports function responders and error injection', async () => {
    const g = new FakeGeocodingProvider();
    g.searchScript.respondWith((q) => (q === 'ok' ? ok([sampleLocation]) : err(serviceUnavailable())));
    expect((await g.search('ok', 5)).ok).toBe(true);
    expect((await g.search('bad', 5)).ok).toBe(false);
  });

  it('holds calls pending, resolves them later and observes abort', async () => {
    const g = new FakeGeocodingProvider();
    g.searchScript.hold();
    const ac = new AbortController();
    const p = g.search('slow', 5, ac.signal);
    expect(g.searchScript.pending).toHaveLength(1);
    expect(g.searchScript.calls[0]?.aborted).toBe(false);
    ac.abort();
    expect(g.searchScript.calls[0]?.aborted).toBe(true);
    g.searchScript.resolveNext(err(notFound()));
    expect((await p).ok).toBe(false);
    expect(g.searchScript.pending).toHaveLength(0);
    expect(() => g.searchScript.resolveNext(ok([]))).toThrow();
  });

  it('can reject to simulate a contract violation', async () => {
    const g = new FakeGeocodingProvider();
    g.searchScript.failWith(new Error('boom'));
    await expect(g.search('x', 1)).rejects.toThrow('boom');
  });

  it('reverse exists only when requested', async () => {
    expect(new FakeGeocodingProvider().reverse).toBeUndefined();
    const g = new FakeGeocodingProvider({ withReverse: true });
    expect(await g.reverse?.(1, 2)).toEqual(err(notFound()));
    g.reverseScript?.respondWith(ok(sampleLocation));
    expect(await g.reverse?.(1, 2)).toEqual(ok(sampleLocation));
    expect(g.reverseScript?.calls[1]?.args).toEqual([1, 2]);
  });
});

describe('FakeWeatherProvider', () => {
  it('defaults to empty data, scripts each method independently and counts calls', async () => {
    const w = new FakeWeatherProvider();
    const ac = new AbortController();
    expect(await w.getCurrent(sampleLocation, ac.signal)).toEqual(ok({}));
    expect(await w.getForecast(sampleLocation, 3, false, ac.signal)).toEqual(ok([]));
    w.currentScript.respondWith(ok(sampleCurrent));
    w.forecastScript.respondWith(err(serviceUnavailable()));
    expect(await w.getCurrent(sampleLocation, ac.signal)).toEqual(ok(sampleCurrent));
    expect((await w.getForecast(sampleLocation, 3, true, ac.signal)).ok).toBe(false);
    expect(w.currentScript.callCount).toBe(2);
    expect(w.forecastScript.calls[1]?.args[1]).toBe(3);
    expect(w.forecastScript.calls[1]?.args[2]).toBe(true);
  });

  it('holds and resolves with deferred results', async () => {
    const w = new FakeWeatherProvider();
    w.forecastScript.hold();
    const p = w.getForecast(sampleLocation, 3, false, new AbortController().signal);
    expect(w.forecastScript.pending).toHaveLength(1);
    w.forecastScript.pending[0]?.resolve(ok(sampleForecast));
    expect(await p).toEqual(ok(sampleForecast));
  });
});

describe('FakeLocationService', () => {
  it('reports the configured permission and counts reads', async () => {
    const l = new FakeLocationService('granted');
    expect(await l.getPermissionState()).toBe('granted');
    l.permission = 'denied';
    expect(await l.getPermissionState()).toBe('denied');
    expect(l.permissionCalls).toBe(2);
  });

  it('returns scripted positions and records the timeout', async () => {
    const l = new FakeLocationService();
    const ac = new AbortController();
    const unavailable = await l.getCurrentPosition(5000, ac.signal);
    expect(!unavailable.ok && !isAborted(unavailable) && unavailable.error.code).toBe('LOCATION_UNAVAILABLE');
    l.positionScript.respondWith(ok({ lat: 1, lon: 2 }));
    expect(await l.getCurrentPosition(5000, ac.signal)).toEqual(ok({ lat: 1, lon: 2 }));
    expect(l.positionScript.calls[0]?.args).toEqual([5000]);
  });

  it('a held call settles with ABORTED when aborted, never hangs', async () => {
    const l = new FakeLocationService('granted');
    l.positionScript.hold();
    const ac = new AbortController();
    const p = l.getCurrentPosition(1000, ac.signal);
    ac.abort();
    expect(isAborted(await p)).toBe(true);
    // Already aborted signal settles immediately.
    expect(isAborted(await l.getCurrentPosition(1000, ac.signal))).toBe(true);
  });
});

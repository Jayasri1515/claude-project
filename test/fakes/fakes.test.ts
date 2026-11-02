import { afterEach, describe, expect, it, vi } from 'vitest';
import { notFound, serviceUnavailable } from '../../src/core/errors';
import { isAborted } from '../../src/core/ports';
import type {
  Clock,
  GeocodingProvider,
  KeyValueStore,
  LegacyGeocodingProvider,
  LegacyLocationService,
  LegacyWeatherProvider,
  LocationService,
  WeatherProvider,
} from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import { sampleCoords, sampleCurrent, sampleForecast, sampleLocation, samplePlace, sampleWeatherResult } from '../fixtures/domain';
import {
  FakeClock,
  FakeGeocodingProvider,
  FakeLocationService,
  FakeWeatherProvider,
  InMemoryKeyValueStore,
  LegacyFakeGeocodingProvider,
  LegacyFakeLocationService,
  LegacyFakeWeatherProvider,
} from './index';

afterEach(() => {
  vi.useRealTimers();
});

describe('fakes satisfy their port types (compile-time) ', () => {
  it('assigns to the port interfaces', () => {
    const g: GeocodingProvider = new FakeGeocodingProvider();
    const w: WeatherProvider = new FakeWeatherProvider();
    const l: LocationService = new FakeLocationService();
    const k: KeyValueStore = new InMemoryKeyValueStore();
    const c: Clock = new FakeClock();
    expect([g, w, l, k, c]).toHaveLength(5);
  });

  it('assigns the legacy fakes to the legacy ports', () => {
    const g: LegacyGeocodingProvider = new LegacyFakeGeocodingProvider();
    const w: LegacyWeatherProvider = new LegacyFakeWeatherProvider();
    const l: LegacyLocationService = new LegacyFakeLocationService();
    expect([g, w, l]).toHaveLength(3);
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

  it('forced failures return storage_unavailable per operation', () => {
    const s = new InMemoryKeyValueStore({ a: '1' });
    s.fail.get = true;
    const g = s.get('a');
    expect(!g.ok && g.error.kind).toBe('storage_unavailable');
    s.fail.get = false;
    s.fail.set = true;
    const set = s.set('x', 'y');
    expect(!set.ok && set.error.kind).toBe('storage_unavailable');
    expect(s.data.has('x')).toBe(false);
    s.failAll();
    const rm = s.remove('a');
    expect(!rm.ok).toBe(true);
    expect(s.data.get('a')).toBe('1');
    s.failAll(false);
    expect(s.get('a').ok).toBe(true);
  });

  it('throwing mode throws per operation and leaves data untouched', () => {
    const s = new InMemoryKeyValueStore({ a: '1' });
    s.throws.set = true;
    expect(() => s.set('x', 'y')).toThrow();
    expect(s.data.has('x')).toBe(false);
    expect(s.get('a').ok).toBe(true);
    s.throwAll();
    expect(() => s.get('a')).toThrow();
    expect(() => s.remove('a')).toThrow();
    expect(s.data.get('a')).toBe('1');
    s.throwAll(false);
    expect(s.remove('a').ok).toBe(true);
    expect([s.getCalls, s.setCalls, s.removeCalls]).toEqual([2, 1, 2]);
  });
});

describe('ScriptedMethod behaviour through FakeWeatherProvider', () => {
  const signal = (): AbortSignal => new AbortController().signal;

  it('defaults to both sections present but empty, records calls and returns scripted results', async () => {
    const w = new FakeWeatherProvider();
    expect(await w.get(sampleCoords, signal())).toEqual(ok({ current: ok({}), forecast: ok([]) }));
    w.getScript.respondWith(ok(sampleWeatherResult));
    expect(await w.get({ lat: 1, lon: 2 }, signal())).toEqual(ok(sampleWeatherResult));
    expect(w.getScript.callCount).toBe(2);
    expect(w.getScript.calls[1]?.args).toEqual([{ lat: 1, lon: 2 }]);
  });

  it('answers a whole-request failure', async () => {
    const w = new FakeWeatherProvider();
    w.getScript.respondWith(err(serviceUnavailable()));
    const result = await w.get(sampleCoords, signal());
    expect(!result.ok && result.error.kind).toBe('service');
  });

  it('delays the answer by the configured latency and can be advanced with fake timers', async () => {
    vi.useFakeTimers();
    const w = new FakeWeatherProvider();
    w.getScript.setLatency(500);
    let settled = false;
    const p = w.get(sampleCoords, signal()).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).ok).toBe(true);
    w.getScript.reset();
    w.getScript.hold();
    expect(w.getScript.pending).toHaveLength(0);
  });

  it('a delayed call settles as aborted when its signal aborts first', async () => {
    vi.useFakeTimers();
    const w = new FakeWeatherProvider();
    w.getScript.setLatency(10_000);
    const ac = new AbortController();
    const p = w.get(sampleCoords, ac.signal);
    ac.abort();
    const result = await p;
    expect(!result.ok && result.error.kind).toBe('aborted');
  });

  it('holds and resolves with deferred results, then settles held calls as aborted on abort', async () => {
    const w = new FakeWeatherProvider();
    w.getScript.hold();
    const p = w.get(sampleCoords, signal());
    expect(w.getScript.pending).toHaveLength(1);
    w.getScript.pending[0]?.resolve(ok(sampleWeatherResult));
    expect(await p).toEqual(ok(sampleWeatherResult));

    const ac = new AbortController();
    const held = w.get(sampleCoords, ac.signal);
    ac.abort();
    const result = await held;
    expect(!result.ok && result.error.kind).toBe('aborted');
  });

  it('can reject to simulate a contract violation', async () => {
    const w = new FakeWeatherProvider();
    w.getScript.failWith(new Error('boom'));
    await expect(w.get(sampleCoords, signal())).rejects.toThrow('boom');
  });

  it('resolveNext throws when nothing is pending', () => {
    expect(() => new FakeWeatherProvider().getScript.resolveNext(ok(sampleWeatherResult))).toThrow();
  });
});

describe('FakeGeocodingProvider', () => {
  const signal = (): AbortSignal => new AbortController().signal;

  it('defaults to no match, records calls and returns scripted results', async () => {
    const g = new FakeGeocodingProvider();
    expect(await g.search('x', 5, signal())).toEqual(ok([]));
    g.searchScript.respondWith(ok([samplePlace]));
    expect(await g.search('y', 3, signal())).toEqual(ok([samplePlace]));
    expect(g.searchScript.callCount).toBe(2);
    expect(g.searchScript.calls[1]?.args).toEqual(['y', 3]);
  });

  it('supports function responders and error injection', async () => {
    const g = new FakeGeocodingProvider();
    g.searchScript.respondWith((q) => (q === 'ok' ? ok([samplePlace]) : err(serviceUnavailable())));
    expect((await g.search('ok', 5, signal())).ok).toBe(true);
    expect((await g.search('bad', 5, signal())).ok).toBe(false);
  });

  it('holds calls pending and settles them as aborted when the signal aborts', async () => {
    const g = new FakeGeocodingProvider();
    g.searchScript.hold();
    const ac = new AbortController();
    const p = g.search('slow', 5, ac.signal);
    expect(g.searchScript.pending).toHaveLength(1);
    expect(g.searchScript.calls[0]?.aborted).toBe(false);
    ac.abort();
    expect(g.searchScript.calls[0]?.aborted).toBe(true);
    const result = await p;
    expect(!result.ok && result.error.kind).toBe('aborted');
    expect(g.searchScript.pending).toHaveLength(0);
    expect(() => g.searchScript.resolveNext(ok([]))).toThrow();
  });

  it('can reject to simulate a contract violation', async () => {
    const g = new FakeGeocodingProvider();
    g.searchScript.failWith(new Error('boom'));
    await expect(g.search('x', 1, signal())).rejects.toThrow('boom');
  });

  it('reverse exists only when requested', async () => {
    expect(new FakeGeocodingProvider().reverse).toBeUndefined();
    const g = new FakeGeocodingProvider({ withReverse: true });
    expect(await g.reverse?.(sampleCoords, signal())).toEqual(err(notFound()));
    g.reverseScript?.respondWith(ok(samplePlace));
    expect(await g.reverse?.(sampleCoords, signal())).toEqual(ok(samplePlace));
    expect(g.reverseScript?.calls[1]?.args).toEqual([sampleCoords]);
  });
});

describe('FakeLocationService', () => {
  it('returns scripted positions and defaults to position_unavailable', async () => {
    const l = new FakeLocationService();
    const ac = new AbortController();
    const unavailable = await l.getPosition(ac.signal);
    expect(!unavailable.ok && unavailable.error.kind).toBe('position_unavailable');
    l.positionScript.respondWith(ok({ lat: 1, lon: 2 }));
    expect(await l.getPosition(ac.signal)).toEqual(ok({ lat: 1, lon: 2 }));
    expect(l.positionScript.callCount).toBe(2);
  });

  it('a held call settles as aborted when aborted, never hangs', async () => {
    const l = new FakeLocationService();
    l.positionScript.hold();
    const ac = new AbortController();
    const p = l.getPosition(ac.signal);
    ac.abort();
    const result = await p;
    expect(!result.ok && result.error.kind).toBe('aborted');
    // An already aborted signal settles immediately.
    const again = await l.getPosition(ac.signal);
    expect(!again.ok && again.error.kind).toBe('aborted');
  });
});

describe('legacy fakes (removed with the legacy ports in Phase 2)', () => {
  it('LegacyFakeWeatherProvider scripts each method independently', async () => {
    const w = new LegacyFakeWeatherProvider();
    const ac = new AbortController();
    expect(await w.getCurrent(sampleLocation, ac.signal)).toEqual(ok({}));
    expect(await w.getForecast(sampleLocation, 3, false, ac.signal)).toEqual(ok([]));
    w.currentScript.respondWith(ok(sampleCurrent));
    w.forecastScript.respondWith(ok(sampleForecast));
    expect(await w.getCurrent(sampleLocation, ac.signal)).toEqual(ok(sampleCurrent));
    expect(await w.getForecast(sampleLocation, 3, true, ac.signal)).toEqual(ok(sampleForecast));
    expect(w.forecastScript.calls[1]?.args[2]).toBe(true);
  });

  it('LegacyFakeGeocodingProvider searches and offers reverse only on request', async () => {
    const g = new LegacyFakeGeocodingProvider();
    expect(await g.search('x', 5)).toEqual(ok([]));
    g.searchScript.respondWith(ok([sampleLocation]));
    expect(await g.search('y', 3)).toEqual(ok([sampleLocation]));
    expect(g.reverse).toBeUndefined();
    const withReverse = new LegacyFakeGeocodingProvider({ withReverse: true });
    expect(await withReverse.reverse?.(1, 2)).toEqual(err(notFound()));
  });

  it('LegacyFakeLocationService reports permission and settles a held call with ABORTED', async () => {
    const l = new LegacyFakeLocationService('granted');
    expect(await l.getPermissionState()).toBe('granted');
    l.permission = 'denied';
    expect(await l.getPermissionState()).toBe('denied');
    expect(l.permissionCalls).toBe(2);
    l.positionScript.hold();
    const ac = new AbortController();
    const p = l.getCurrentPosition(ac.signal);
    ac.abort();
    expect(isAborted(await p)).toBe(true);
    expect(l.positionScript.calls[0]?.args).toEqual([]); // no timeout argument: the watchdog is app-owned
  });

  it('LegacyFakeLocationService.whenPermissionGranted answers false at once by default and can be held, then granted', async () => {
    const l = new LegacyFakeLocationService('prompt');
    expect(await l.whenPermissionGranted(new AbortController().signal)).toBe(false);
    l.grantScript.hold();
    const ac = new AbortController();
    const granted = l.whenPermissionGranted(new AbortController().signal);
    const aborted = l.whenPermissionGranted(ac.signal);
    ac.abort();
    expect(await aborted).toBe(false);
    l.grantScript.pending[0]?.resolve(true);
    expect(await granted).toBe(true);
  });
});

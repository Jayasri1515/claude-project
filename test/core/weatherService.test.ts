import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortedResult } from '../../src/core/aborted';
import { createConfig } from '../../src/core/config';
import type { CurrentWeather, ForecastDay, WeatherSnapshot } from '../../src/core/domain';
import { serviceUnavailable } from '../../src/core/errors';
import { deriveLastUpdated } from '../../src/core/forecast';
import { err, ok } from '../../src/core/result';
import { WeatherService } from '../../src/core/weatherService';
import type { WeatherRequestContext } from '../../src/core/weatherService';
import { sampleCurrent, sampleForecast, sampleLocation } from '../fixtures/domain';
import { FakeClock, FakeWeatherProvider } from '../fakes';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-01T10:05:00Z');

function setup(overrides = {}) {
  const provider = new FakeWeatherProvider();
  const clock = new FakeClock(T0);
  const config = createConfig(overrides);
  const service = new WeatherService({ provider, clock, config });
  const ctx = (): WeatherRequestContext & { controller: AbortController } => {
    const controller = new AbortController();
    return { signal: controller.signal, controller };
  };
  return { provider, clock, service, ctx };
}

async function done(p: ReturnType<WeatherService['load']>): Promise<WeatherSnapshot> {
  const r = await p;
  if (isAbortedResult(r)) throw new Error('unexpected abort');
  return r.value;
}

/** A snapshot as left by an earlier successful load. */
const previousSnapshot = (): WeatherSnapshot => ({
  location: sampleLocation,
  current: { status: 'ready', data: { temperatureC: 5 }, updatedAt: T0 },
  forecast: { status: 'ready', data: [{ date: '2026-01-02', tempMaxC: 6 }], updatedAt: T0 },
});

/** Let queued promise callbacks run (real timers only). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('WeatherService load', () => {
  it('both sections succeed: ready, same updatedAt, lastUpdated set', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.respondWith(ok(sampleCurrent));
    provider.forecastScript.respondWith(ok(sampleForecast));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current).toEqual({ status: 'ready', data: sampleCurrent, updatedAt: T0 });
    expect(snap.forecast).toEqual({ status: 'ready', data: sampleForecast, updatedAt: T0 });
    expect(deriveLastUpdated(snap.current, snap.forecast)).toEqual(T0);
  });

  it('when the sections finish at different times, both get the older time', async () => {
    const { provider, clock, service, ctx } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const p = service.load(sampleLocation, ctx());
    clock.set(T0);
    provider.currentScript.resolveNext(ok(sampleCurrent));
    await flush();
    clock.set(T1);
    provider.forecastScript.resolveNext(ok(sampleForecast));
    const snap = await done(p);
    expect(snap.current.updatedAt).toEqual(T0);
    expect(snap.forecast.updatedAt).toEqual(T0);
  });

  it('requests configured days and includeToday, and stores at most forecastDays', async () => {
    const { provider, service, ctx } = setup();
    const five: ForecastDay[] = Array.from({ length: 5 }, (_, i) => ({ date: `2026-01-0${i + 1}` }));
    provider.forecastScript.respondWith(ok(five));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(provider.forecastScript.calls[0]?.args).toEqual([sampleLocation, 3, false]);
    expect(snap.forecast.data).toHaveLength(3);
  });

  it('exposes forecast slots padded to the configured count', async () => {
    const { provider, service, ctx } = setup();
    provider.forecastScript.respondWith(ok(sampleForecast.slice(0, 1)));
    const snap = await done(service.load(sampleLocation, ctx()));
    const slots = service.forecastSlots(snap);
    expect(slots.map((s) => s.kind)).toEqual(['day', 'unavailable', 'unavailable']);
  });

  it('missing provider fields stay undefined (no defaults invented)', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.respondWith(ok({ condition: 'CLEAR' } as CurrentWeather));
    provider.forecastScript.respondWith(ok([{ date: '2026-01-02' }]));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current.data?.temperatureC).toBeUndefined();
    expect(snap.current.data?.humidityPct).toBeUndefined();
    expect(snap.forecast.data?.[0]?.tempMaxC).toBeUndefined();
  });

  it('first load failing leaves an error section with no data or time', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.respondWith(err(serviceUnavailable()));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current.status).toBe('error');
    expect(snap.current.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(snap.current.data).toBeUndefined();
    expect(snap.current.updatedAt).toBeUndefined();
    expect(snap.forecast.status).toBe('ready');
    expect(deriveLastUpdated(snap.current, snap.forecast)).toBeUndefined();
  });

  it('a provider that throws becomes a section error, not a rejection', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.failWith(new Error('boom'));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current.error?.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a signal that is already aborted makes no provider call', async () => {
    const { provider, service, ctx } = setup();
    const c = ctx();
    c.controller.abort();
    expect(isAbortedResult(await service.load(sampleLocation, c))).toBe(true);
    expect(provider.currentScript.callCount + provider.forecastScript.callCount).toBe(0);
  });

  it('reports progress per section via onUpdate', async () => {
    const { provider, service } = setup();
    provider.forecastScript.hold();
    const seen: Array<[string, string]> = [];
    const controller = new AbortController();
    const p = service.load(sampleLocation, {
      signal: controller.signal,
      onUpdate: (s) => seen.push([s.current.status, s.forecast.status]),
    });
    await flush();
    expect(seen[0]).toEqual(['loading', 'loading']);
    expect(seen).toContainEqual(['ready', 'loading']);
    provider.forecastScript.resolveNext(ok(sampleForecast));
    await p;
    expect(seen[seen.length - 1]).toEqual(['ready', 'ready']);
  });
});

describe('WeatherService refresh and partial failure', () => {
  it('current fails: forecast updates, current keeps data and old time', async () => {
    const { provider, clock, service, ctx } = setup();
    clock.set(T1);
    provider.currentScript.respondWith(err(serviceUnavailable()));
    provider.forecastScript.respondWith(ok(sampleForecast));
    const snap = await done(service.refresh(previousSnapshot(), ctx()));
    expect(snap.current.status).toBe('error');
    expect(snap.current.data).toEqual({ temperatureC: 5 });
    expect(snap.current.updatedAt).toEqual(T0);
    expect(snap.forecast).toEqual({ status: 'ready', data: sampleForecast, updatedAt: T1 });
    expect(deriveLastUpdated(snap.current, snap.forecast)).toEqual(T0);
  });

  it('forecast fails: current updates, forecast keeps data and old time', async () => {
    const { provider, clock, service, ctx } = setup();
    clock.set(T1);
    provider.currentScript.respondWith(ok(sampleCurrent));
    provider.forecastScript.respondWith(err(serviceUnavailable()));
    const snap = await done(service.refresh(previousSnapshot(), ctx()));
    expect(snap.current).toEqual({ status: 'ready', data: sampleCurrent, updatedAt: T1 });
    expect(snap.forecast.status).toBe('error');
    expect(snap.forecast.data).toEqual([{ date: '2026-01-02', tempMaxC: 6 }]);
    expect(snap.forecast.updatedAt).toEqual(T0);
    expect(deriveLastUpdated(snap.current, snap.forecast)).toEqual(T0);
  });

  it('both fail: previous data and times are kept (AC-P-02)', async () => {
    const { provider, clock, service, ctx } = setup();
    clock.set(T1);
    provider.currentScript.respondWith(err(serviceUnavailable()));
    provider.forecastScript.respondWith(err(serviceUnavailable()));
    const prev = previousSnapshot();
    const snap = await done(service.refresh(prev, ctx()));
    expect(snap.current.data).toEqual(prev.current.data);
    expect(snap.forecast.data).toEqual(prev.forecast.data);
    expect(snap.current.updatedAt).toEqual(T0);
    expect(snap.forecast.updatedAt).toEqual(T0);
    expect(snap.current.status).toBe('error');
    expect(snap.forecast.status).toBe('error');
  });

  it('keeps previous data visible (loading) while the refresh is in flight', async () => {
    const { provider, service } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const seen: WeatherSnapshot[] = [];
    const controller = new AbortController();
    const p = service.refresh(previousSnapshot(), { signal: controller.signal, onUpdate: (s) => seen.push(s) });
    expect(seen[0]?.current.status).toBe('loading');
    expect(seen[0]?.current.data).toEqual({ temperatureC: 5 });
    expect(seen[0]?.current.updatedAt).toEqual(T0);
    provider.currentScript.resolveNext(ok({}));
    provider.forecastScript.resolveNext(ok([]));
    await p;
  });

  it('five rapid refreshes produce exactly one provider call per section (AC-P-03)', async () => {
    const { provider, service } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const prev = previousSnapshot();
    const promises = Array.from({ length: 5 }, () =>
      service.refresh(prev, { signal: new AbortController().signal }),
    );
    expect(provider.currentScript.callCount).toBe(1);
    expect(provider.forecastScript.callCount).toBe(1);
    provider.currentScript.resolveNext(ok(sampleCurrent));
    provider.forecastScript.resolveNext(ok(sampleForecast));
    const results = await Promise.all(promises);
    expect(new Set(results).size).toBe(1);
    // After completion a new refresh is a new request.
    provider.currentScript.release();
    provider.forecastScript.release();
    await service.refresh(prev, { signal: new AbortController().signal });
    expect(provider.currentScript.callCount).toBe(2);
    expect(provider.forecastScript.callCount).toBe(2);
  });

  it('load and refresh for the same location are separate operations', async () => {
    const { provider, service } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const a = service.load(sampleLocation, { signal: new AbortController().signal });
    const b = service.refresh(previousSnapshot(), { signal: new AbortController().signal });
    expect(provider.currentScript.callCount).toBe(2);
    provider.currentScript.pending.forEach((c) => c.resolve(ok({})));
    provider.forecastScript.pending.forEach((c) => c.resolve(ok([])));
    await Promise.all([a, b]);
  });
});

describe('WeatherService timeout and supersession', () => {
  it('times out at weatherTimeoutMs (10 s) with TIMEOUT per section and aborts the provider call', async () => {
    vi.useFakeTimers();
    const { provider, service, ctx } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    let result: Awaited<ReturnType<WeatherService['load']>> | undefined;
    const p = service.load(sampleLocation, ctx()).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await p;
    const snap = await done(Promise.resolve(result as NonNullable<typeof result>));
    expect(snap.current.error?.code).toBe('TIMEOUT');
    expect(snap.forecast.error?.code).toBe('TIMEOUT');
    expect(provider.currentScript.calls[0]?.aborted).toBe(true);
    expect(provider.forecastScript.calls[0]?.aborted).toBe(true);
    expect(provider.currentScript.callCount).toBe(1); // no automatic retry
  });

  it('timeout of one section does not abort the other', async () => {
    vi.useFakeTimers();
    const { provider, service, ctx } = setup({ weatherTimeoutMs: 1000 });
    provider.forecastScript.hold();
    const p = service.load(sampleLocation, ctx());
    await vi.advanceTimersByTimeAsync(1000);
    const snap = await done(p);
    expect(snap.current.status).toBe('ready');
    expect(snap.forecast.error?.code).toBe('TIMEOUT');
  });

  it('a superseded request is aborted and its late result discarded', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const updates: WeatherSnapshot[] = [];
    const first = ctx();
    const p = service.load(sampleLocation, { signal: first.signal, onUpdate: (s) => updates.push(s) });
    const countBefore = updates.length;
    first.controller.abort();
    expect(provider.currentScript.calls[0]?.aborted).toBe(true);
    expect(provider.forecastScript.calls[0]?.aborted).toBe(true);
    // The provider answers late anyway.
    provider.currentScript.resolveNext(ok(sampleCurrent));
    provider.forecastScript.resolveNext(ok(sampleForecast));
    expect(isAbortedResult(await p)).toBe(true);
    expect(updates).toHaveLength(countBefore);
  });

  it('a superseded request is not joined by a later load of the same location', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const first = ctx();
    const p1 = service.load(sampleLocation, first);
    first.controller.abort();
    const p2 = service.load(sampleLocation, ctx());
    expect(provider.currentScript.callCount).toBe(2);
    provider.currentScript.pending.forEach((c) => c.resolve(ok(sampleCurrent)));
    provider.forecastScript.pending.forEach((c) => c.resolve(ok(sampleForecast)));
    expect(isAbortedResult(await p1)).toBe(true);
    const snap = await done(p2);
    expect(snap.current.status).toBe('ready');
  });
});

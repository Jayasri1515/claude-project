import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortedResult } from '../../src/core/aborted';
import { createConfig } from '../../src/core/config';
import type { Current, Day, WeatherView } from '../../src/core/domain';
import { aborted, networkError, rateLimited, serviceUnavailable } from '../../src/core/errors';
import { deriveLastUpdated } from '../../src/core/forecast';
import { err, ok } from '../../src/core/result';
import { WeatherService } from '../../src/core/weatherService';
import type { WeatherRequestContext } from '../../src/core/weatherService';
import { sampleCurrent, sampleForecast, sampleLocation } from '../fixtures/domain';
import { FakeClock, LegacyFakeWeatherProvider } from '../fakes';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-01T10:05:00Z');

function setup(overrides = {}) {
  const provider = new LegacyFakeWeatherProvider();
  const clock = new FakeClock(T0);
  const config = createConfig(overrides);
  const service = new WeatherService({ provider, clock, config });
  const ctx = (): WeatherRequestContext & { controller: AbortController } => {
    const controller = new AbortController();
    return { signal: controller.signal, controller };
  };
  return { provider, clock, service, ctx };
}

async function done(p: ReturnType<WeatherService['load']>): Promise<WeatherView> {
  const r = await p;
  if (isAbortedResult(r)) throw new Error('unexpected abort');
  return r.value;
}

/** A view as left by an earlier successful load. */
const previousSnapshot = (): WeatherView => ({
  key: sampleLocation.key,
  label: 'Placeholder City, Testshire, Testland',
  timeZone: 'Europe/Oslo',
  current: { status: 'ready', data: { tempCanonical: 5 }, updatedAt: T0 },
  forecast: { status: 'ready', data: [{ localDate: '2026-01-02', highCanonical: 6 }], updatedAt: T0 },
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

  it('the view carries the location key and display label, and the time zone of the answer', async () => {
    const { provider, service, ctx } = setup();
    provider.timeZone = 'Europe/Oslo';
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.key).toBe(sampleLocation.key);
    expect(snap.label).toBe('Placeholder City, Testshire, Testland');
    expect(snap.timeZone).toBe('Europe/Oslo');
    const without = new LegacyFakeWeatherProvider();
    const other = new WeatherService({ provider: without, clock: new FakeClock(T0), config: createConfig() });
    expect(await done(other.load(sampleLocation, ctx()))).not.toHaveProperty('timeZone');
  });

  it('asks the provider once, with the exact coordinates of the location (rounding is the adapter\'s job)', async () => {
    const { provider, service, ctx } = setup();
    const exact = { ...sampleLocation, latitude: 33.123456, longitude: -44.654321 };
    await done(service.load(exact, ctx()));
    expect(provider.currentScript.calls.map((c) => c.args)).toEqual([[{ lat: 33.123456, lon: -44.654321 }]]);
    expect(provider.forecastScript.calls.map((c) => c.args)).toEqual([[{ lat: 33.123456, lon: -44.654321 }]]);
  });

  it('both sections get the same updatedAt: the clock is read when the one answer arrives', async () => {
    const { provider, clock, service, ctx } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const p = service.load(sampleLocation, ctx());
    clock.set(T0);
    provider.currentScript.resolveNext(ok(sampleCurrent));
    await flush();
    // The forecast is still outstanding: nothing has arrived yet, so no time was taken.
    clock.set(T1);
    provider.forecastScript.resolveNext(ok(sampleForecast));
    const snap = await done(p);
    expect(snap.current.updatedAt).toEqual(T1);
    expect(snap.forecast.updatedAt).toEqual(T1);
  });

  it('stores at most forecastDays; the days and "today" choice are the provider\'s request, not the service\'s', async () => {
    const { provider, service, ctx } = setup();
    const five: Day[] = Array.from({ length: 5 }, (_, i) => ({ localDate: `2026-01-0${i + 1}` }));
    provider.forecastScript.respondWith(ok(five));
    const snap = await done(service.load(sampleLocation, ctx()));
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
    provider.currentScript.respondWith(ok({ conditionCategory: 'CLEAR' } as Current));
    provider.forecastScript.respondWith(ok([{ localDate: '2026-01-02' }]));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current.data?.tempCanonical).toBeUndefined();
    expect(snap.current.data?.humidityPct).toBeUndefined();
    expect(snap.forecast.data?.[0]?.highCanonical).toBeUndefined();
  });

  it('first load failing in one section leaves an error section with no data or time; the other is ready', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.respondWith(err(serviceUnavailable()));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current.status).toBe('error');
    expect(snap.current.error?.kind).toBe('service');
    expect(snap.current.data).toBeUndefined();
    expect(snap.current.updatedAt).toBeUndefined();
    expect(snap.forecast.status).toBe('ready');
    expect(deriveLastUpdated(snap.current, snap.forecast)).toBeUndefined();
  });

  it('a whole-call failure (provider error result) puts the same error on both sections, with no data or time', async () => {
    const { ctx } = setup();
    const failing = new WeatherService({
      provider: { get: async () => err(networkError()) },
      clock: new FakeClock(T0),
      config: createConfig(),
    });
    const snap = await done(failing.load(sampleLocation, ctx()));
    expect(snap.current).toEqual({ status: 'error', error: networkError() });
    expect(snap.forecast).toEqual({ status: 'error', error: networkError() });
  });

  it('a provider that throws becomes SERVICE_UNAVAILABLE on both sections, not a rejection', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.failWith(new Error('boom'));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current.error?.kind).toBe('service');
    expect(snap.forecast.error?.kind).toBe('service');
  });

  it('a signal that is already aborted makes no provider call', async () => {
    const { provider, service, ctx } = setup();
    const c = ctx();
    c.controller.abort();
    expect(isAbortedResult(await service.load(sampleLocation, c))).toBe(true);
    expect(provider.currentScript.callCount + provider.forecastScript.callCount).toBe(0);
  });

  it('reports loading first and then both sections together via onUpdate (no section arrives alone)', async () => {
    const { provider, service } = setup();
    provider.forecastScript.hold();
    const seen: Array<[string, string]> = [];
    const controller = new AbortController();
    const p = service.load(sampleLocation, {
      signal: controller.signal,
      onUpdate: (s) => seen.push([s.current.status, s.forecast.status]),
    });
    await flush();
    expect(seen).toEqual([['loading', 'loading']]); // the current section alone does not show while the forecast is outstanding
    provider.forecastScript.resolveNext(ok(sampleForecast));
    await p;
    expect(seen).toEqual([
      ['loading', 'loading'],
      ['ready', 'ready'],
    ]);
  });
});

describe('WeatherService rate limit and provider aborts', () => {
  it('a rate-limited section keeps its own kind and message key, and the other section is unaffected', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.respondWith(err(rateLimited()));
    provider.forecastScript.respondWith(ok(sampleForecast));
    const snap = await done(service.load(sampleLocation, ctx()));
    expect(snap.current.error).toEqual({ kind: 'rate_limited', messageKey: 'error.rateLimited' });
    expect(snap.forecast.status).toBe('ready');
  });

  it('a provider answer of kind aborted is never stored in a section: the load is discarded (DR-09)', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.respondWith(err(aborted()));
    provider.forecastScript.respondWith(ok(sampleForecast));
    const seen: WeatherView[] = [];
    const r = await service.load(sampleLocation, { ...ctx(), onUpdate: (s) => seen.push(s) });
    // The load is discarded; no view carries an aborted error.
    expect(isAbortedResult(r)).toBe(true);
    expect(seen.every((s) => s.current.error === undefined && s.forecast.error === undefined)).toBe(true);
  });

  it('the caller aborting mid-load returns the discard outcome with no further updates', async () => {
    const { provider, service, ctx } = setup();
    const context = ctx();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const updates: WeatherView[] = [];
    const p = service.load(sampleLocation, { ...context, onUpdate: (s) => updates.push(s) });
    await flush(); // both provider calls are now outstanding
    const before = updates.length;
    context.controller.abort();
    expect(isAbortedResult(await p)).toBe(true);
    expect(updates.length).toBe(before);
  });
});

describe('WeatherService refresh and partial failure', () => {
  it('current fails: forecast updates, current keeps data and old time', async () => {
    const { provider, clock, service, ctx } = setup();
    clock.set(T1);
    provider.currentScript.respondWith(err(serviceUnavailable()));
    provider.forecastScript.respondWith(ok(sampleForecast));
    const snap = await done(service.refresh(sampleLocation, previousSnapshot(), ctx()));
    expect(snap.current.status).toBe('error');
    expect(snap.current.data).toEqual({ tempCanonical: 5 });
    expect(snap.current.updatedAt).toEqual(T0);
    expect(snap.forecast).toEqual({ status: 'ready', data: sampleForecast, updatedAt: T1 });
    expect(deriveLastUpdated(snap.current, snap.forecast)).toEqual(T0);
  });

  it('forecast fails: current updates, forecast keeps data and old time', async () => {
    const { provider, clock, service, ctx } = setup();
    clock.set(T1);
    provider.currentScript.respondWith(ok(sampleCurrent));
    provider.forecastScript.respondWith(err(serviceUnavailable()));
    const snap = await done(service.refresh(sampleLocation, previousSnapshot(), ctx()));
    expect(snap.current).toEqual({ status: 'ready', data: sampleCurrent, updatedAt: T1 });
    expect(snap.forecast.status).toBe('error');
    expect(snap.forecast.data).toEqual([{ localDate: '2026-01-02', highCanonical: 6 }]);
    expect(snap.forecast.updatedAt).toEqual(T0);
    expect(deriveLastUpdated(snap.current, snap.forecast)).toEqual(T0);
  });

  it('both fail: previous data and times are kept (AC-P-02)', async () => {
    const { provider, clock, service, ctx } = setup();
    clock.set(T1);
    provider.currentScript.respondWith(err(serviceUnavailable()));
    provider.forecastScript.respondWith(err(serviceUnavailable()));
    const prev = previousSnapshot();
    const snap = await done(service.refresh(sampleLocation, prev, ctx()));
    expect(snap.current.data).toEqual(prev.current.data);
    expect(snap.forecast.data).toEqual(prev.forecast.data);
    expect(snap.current.updatedAt).toEqual(T0);
    expect(snap.forecast.updatedAt).toEqual(T0);
    expect(snap.current.status).toBe('error');
    expect(snap.forecast.status).toBe('error');
  });

  it('a whole-call failure on refresh keeps previous data, times and time zone on both sections', async () => {
    const { clock, ctx } = setup();
    clock.set(T1);
    const failing = new WeatherService({
      provider: { get: async () => err(networkError()) },
      clock,
      config: createConfig(),
    });
    const prev = previousSnapshot();
    const snap = await done(failing.refresh(sampleLocation, prev, ctx()));
    expect(snap.current).toEqual({ status: 'error', error: networkError(), data: prev.current.data, updatedAt: T0 });
    expect(snap.forecast).toEqual({ status: 'error', error: networkError(), data: prev.forecast.data, updatedAt: T0 });
    expect(snap.timeZone).toBe('Europe/Oslo');
  });

  it('a refresh answer without a time zone keeps the one already known; a new one replaces it', async () => {
    const { provider, service, ctx } = setup();
    expect((await done(service.refresh(sampleLocation, previousSnapshot(), ctx()))).timeZone).toBe('Europe/Oslo');
    provider.timeZone = 'Europe/Berlin';
    expect((await done(service.refresh(sampleLocation, previousSnapshot(), ctx()))).timeZone).toBe('Europe/Berlin');
  });

  it('keeps previous data visible (loading) while the refresh is in flight', async () => {
    const { provider, service } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const seen: WeatherView[] = [];
    const controller = new AbortController();
    const p = service.refresh(sampleLocation, previousSnapshot(), {
      signal: controller.signal,
      onUpdate: (s) => seen.push(s),
    });
    expect(seen[0]?.current.status).toBe('loading');
    expect(seen[0]?.current.data).toEqual({ tempCanonical: 5 });
    expect(seen[0]?.current.updatedAt).toEqual(T0);
    provider.currentScript.resolveNext(ok({}));
    provider.forecastScript.resolveNext(ok([]));
    await p;
  });

  it('does not coalesce requests itself: one-at-a-time loading is the controller\'s job (architecture 3.7)', async () => {
    const { provider, service } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const a = service.load(sampleLocation, { signal: new AbortController().signal });
    const b = service.refresh(sampleLocation, previousSnapshot(), { signal: new AbortController().signal });
    expect(provider.currentScript.callCount).toBe(2);
    expect(provider.forecastScript.callCount).toBe(2);
    provider.currentScript.pending.forEach((c) => c.resolve(ok({})));
    provider.forecastScript.pending.forEach((c) => c.resolve(ok([])));
    await Promise.all([a, b]);
  });
});

describe('WeatherService timeout and supersession', () => {
  it('times out at weatherTimeoutMs (10 s) with TIMEOUT on both sections and aborts the provider call', async () => {
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
    expect(snap.current.error?.kind).toBe('timeout');
    expect(snap.forecast.error?.kind).toBe('timeout');
    expect(provider.currentScript.calls[0]?.aborted).toBe(true);
    expect(provider.forecastScript.calls[0]?.aborted).toBe(true);
    expect(provider.currentScript.callCount).toBe(1); // no automatic retry
  });

  it('a timeout on a refresh keeps the previous data and times on both sections', async () => {
    vi.useFakeTimers();
    const { provider, service, ctx } = setup({ weatherTimeoutMs: 1000 });
    provider.forecastScript.hold();
    const prev = previousSnapshot();
    const p = service.refresh(sampleLocation, prev, ctx());
    await vi.advanceTimersByTimeAsync(1000);
    const snap = await done(p);
    expect(snap.current).toMatchObject({ status: 'error', data: prev.current.data, updatedAt: T0 });
    expect(snap.forecast).toMatchObject({ status: 'error', data: prev.forecast.data, updatedAt: T0 });
    expect(snap.current.error?.kind).toBe('timeout');
    expect(snap.forecast.error?.kind).toBe('timeout');
  });

  it('a superseded request is aborted and its late result discarded', async () => {
    const { provider, service, ctx } = setup();
    provider.currentScript.hold();
    provider.forecastScript.hold();
    const updates: WeatherView[] = [];
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

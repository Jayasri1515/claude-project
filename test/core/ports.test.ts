import { describe, expect, it } from 'vitest';
import { notFound } from '../../src/core/errors';
import type { AppError } from '../../src/core/errors';
import { ABORTED, isAborted } from '../../src/core/ports';
import type {
  Clock,
  LegacyGeocodingProvider,
  KeyValueStore,
  LegacyLocationService,
  PositionResult,
  WeatherProvider,
} from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import { sampleCurrent, sampleForecast, sampleLocation } from '../fixtures/domain';

/**
 * Compile-time conformance check: minimal implementations must satisfy each
 * port type. The full fakes arrive in TASK-012. `npm run typecheck` is the
 * real assertion; the runtime expectations just exercise the shapes.
 */
describe('port interfaces', () => {
  it('LegacyGeocodingProvider: reverse is optional', async () => {
    const withoutReverse: LegacyGeocodingProvider = {
      search: async () => ok([sampleLocation]),
    };
    const withReverse: LegacyGeocodingProvider = {
      search: async () => err(notFound()),
      reverse: async () => ok(sampleLocation),
    };
    expect(withoutReverse.reverse).toBeUndefined();
    const r = await withReverse.search('x', 5);
    expect(r.ok).toBe(false);
  });

  it('WeatherProvider has one get(coordinates, signal) that returns both sections', async () => {
    const wp: WeatherProvider = {
      get: async () => ok({ timeZone: 'Etc/UTC', current: ok(sampleCurrent), forecast: ok(sampleForecast) }),
    };
    const result = await wp.get({ lat: sampleLocation.latitude, lon: sampleLocation.longitude }, new AbortController().signal);
    expect(result.ok && result.value.current.ok && result.value.forecast.ok && result.value.forecast.value.length).toBe(3);
  });

  it('LegacyLocationService exposes the permission states and typed position result, with no timeout argument', async () => {
    const ls: LegacyLocationService = {
      getPermissionState: async () => 'prompt',
      getCurrentPosition: async () => ok({ lat: 1, lon: 2 }),
    };
    expect(await ls.getPermissionState()).toBe('prompt');
    const pos = await ls.getCurrentPosition(new AbortController().signal);
    expect(pos.ok && pos.value).toEqual({ lat: 1, lon: 2 });
  });

  it('LegacyGeocodingProvider accepts an optional AbortSignal on search and reverse', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const gp: LegacyGeocodingProvider = {
      search: async (_q, _limit, signal) => {
        seen.push(signal);
        return ok([sampleLocation]);
      },
      reverse: async (_lat, _lon, signal) => {
        seen.push(signal);
        return ok(sampleLocation);
      },
    };
    const ac = new AbortController();
    await gp.search('x', 5);
    await gp.search('x', 5, ac.signal);
    await gp.reverse?.(1, 2);
    await gp.reverse?.(1, 2, ac.signal);
    expect(seen).toEqual([undefined, ac.signal, undefined, ac.signal]);
  });

  it('LegacyLocationService: an aborted request resolves to the documented ABORTED variant', async () => {
    // Reference behavior: settle with ABORTED when the signal aborts, never hang.
    const ls: LegacyLocationService = {
      getPermissionState: async () => 'granted',
      getCurrentPosition: (signal) =>
        new Promise<PositionResult>((resolve) => {
          if (signal.aborted) return resolve(ABORTED);
          signal.addEventListener('abort', () => resolve(ABORTED), { once: true });
        }),
    };
    const ac = new AbortController();
    const pending = ls.getCurrentPosition(ac.signal);
    ac.abort();
    const result = await pending;
    expect(isAborted(result)).toBe(true);
    expect(result).toEqual({ ok: false, aborted: true });

    // Already-aborted signal also settles.
    expect(isAborted(await ls.getCurrentPosition(ac.signal))).toBe(true);
  });

  it('isAborted distinguishes success, typed failure and abort', () => {
    const success: PositionResult = ok({ lat: 1, lon: 2 });
    const failure: PositionResult = err(notFound());
    expect(isAborted(success)).toBe(false);
    expect(isAborted(failure)).toBe(false);
    expect(isAborted(ABORTED)).toBe(true);
    if (!isAborted(failure) && !failure.ok) {
      expect(failure.error.kind).toBe('not_found');
    }
  });

  it('KeyValueStore is synchronous and returns Results', () => {
    const map = new Map<string, string>();
    const store: KeyValueStore = {
      get: (k) => ok(map.get(k)),
      set: (k, v) => {
        map.set(k, v);
        return ok(undefined);
      },
      remove: (k) => {
        map.delete(k);
        return ok(undefined);
      },
    };
    store.set('a', 'b');
    const got = store.get('a');
    expect(got.ok && got.value).toBe('b');
    store.remove('a');
    const gone = store.get('a');
    expect(gone.ok && gone.value).toBeUndefined();
  });

  it('Clock returns a Date', () => {
    const clock: Clock = { now: () => new Date(0) };
    expect(clock.now().getTime()).toBe(0);
  });

  it('error type flows through Result', () => {
    const e: AppError = notFound();
    expect(err(e).error.kind).toBe('not_found');
  });
});

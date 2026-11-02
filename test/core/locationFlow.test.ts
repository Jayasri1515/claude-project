import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAbortedResult } from '../../src/core/aborted';
import { createConfig } from '../../src/core/config';
import { permissionDenied, positionUnavailable, notFound, serviceUnavailable, timeoutError } from '../../src/core/errors';
import { LocationFlow, UNRESOLVED_DEVICE_LOCATION_KEY } from '../../src/core/locationFlow';
import type { LocateHooks, LocateResult } from '../../src/core/locationFlow';
import flowSource from '../../src/core/locationFlow.ts?raw';
import { message } from '../../src/core/messages';
import type { PermissionState } from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import type { AppError } from '../../src/core/errors';
import { sampleLocation } from '../fixtures/domain';
import { LegacyFakeGeocodingProvider, LegacyFakeLocationService } from '../fakes';

const coords = ok({ lat: 12.34, lon: 56.78 });
const WATCHDOG_MS = 4000;

function setup(permission: PermissionState, withReverse = false) {
  const location = new LegacyFakeLocationService(permission);
  const geocoding = new LegacyFakeGeocodingProvider({ withReverse });
  const flow = new LocationFlow({
    location,
    geocoding,
    config: createConfig({ locationTimeoutMs: WATCHDOG_MS }),
  });
  return { location, geocoding, flow, signal: new AbortController().signal };
}

function errorCode(r: unknown): string | undefined {
  const x = r as { ok: boolean; error?: AppError };
  return x.ok ? undefined : x.error?.kind;
}

function failure(r: LocateResult) {
  if (r.ok || isAbortedResult(r)) throw new Error('expected a failure');
  return r;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LocationFlow outcomes (architecture 3.3)', () => {
  it('granted + coordinates: device location, label "Current location" when no reverse', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(coords);
    const r = await flow.locate(signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.location).toMatchObject({
        source: 'device',
        name: 'Current location',
        latitude: 12.34,
        longitude: 56.78,
      });
      // Opaque key: no coordinates in it (conformance F-09).
      expect(r.value.location.key).toBe(`${UNRESOLVED_DEVICE_LOCATION_KEY}:1`);
      expect(r.value.location.key).not.toMatch(/12|34|56|78/);
      expect(r.value.resolvedPlace).toBeUndefined();
    }
    // The port carries no timeout: the watchdog is the flow's, not the browser's.
    expect(location.positionScript.calls[0]?.args).toEqual([]);
  });

  it('unresolved device locations at different coordinates get different keys (M1)', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(coords);
    const first = await flow.locate(signal);
    location.positionScript.respondWith(ok({ lat: 50.5, lon: 60.6 }));
    const second = await flow.locate(signal);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.location.key).not.toBe(second.value.location.key);
    }
  });

  it('an unresolved device location read again at the same coordinates keeps its opaque key', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(coords);
    const first = await flow.locate(signal);
    location.positionScript.respondWith(coords);
    const second = await flow.locate(signal);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.value.location.key).toBe(first.value.location.key);
  });

  it.each(['granted', 'prompt', 'unknown'] as const)(
    'permission %s: the position is requested at once, which is what makes the platform ask (REQ-WF2-01, REQ-WF2-02)',
    async (permission) => {
      const { location, flow, signal } = setup(permission);
      location.positionScript.respondWith(coords);
      expect((await flow.locate(signal)).ok).toBe(true);
      expect(location.positionScript.callCount).toBe(1);
    },
  );

  it('denied permission: permission_denied with the settings hint (M-08), without calling the position port', async () => {
    const { location, flow, signal } = setup('denied');
    const r = failure(await flow.locate(signal));
    expect(r.error.kind).toBe('permission_denied');
    expect(r.hint).toBe('ui.location.deniedHint');
    expect(message(r.hint ?? 'ui.unavailable')).toBe(
      'To use your location, allow location access for this site in your browser settings, then choose Use my location.',
    );
    expect(location.positionScript.callCount).toBe(0);
  });

  it('unsupported: kind unsupported with its own approved text (M-12), without calling the position port', async () => {
    const { location, flow, signal } = setup('unsupported');
    const r = failure(await flow.locate(signal));
    expect(r.error.kind).toBe('unsupported');
    expect(r.error.kind !== 'aborted' && message(r.error.messageKey)).toBe(
      'Location detection is not available in this browser. You can search for a city instead.',
    );
    expect(location.positionScript.callCount).toBe(0);
  });

  it('a denial from the position call carries no hint when the platform does not report denied', async () => {
    const { location, flow, signal } = setup('prompt');
    location.positionScript.respondWith(err(permissionDenied()));
    const r = failure(await flow.locate(signal));
    expect(r.error.kind).toBe('permission_denied');
    expect(r.hint).toBeUndefined();
  });

  it('a prompt answered with "Block" (the platform reports denied afterwards) gets the settings hint', async () => {
    const { location, flow, signal } = setup('prompt');
    location.positionScript.respondWith(() => {
      location.permission = 'denied';
      return err(permissionDenied());
    });
    const r = failure(await flow.locate(signal));
    expect(r.error.kind).toBe('permission_denied');
    expect(r.hint).toBe('ui.location.deniedHint');
  });

  it('position_unavailable is passed through', async () => {
    const { location, flow, signal } = setup('prompt');
    location.positionScript.respondWith(err(positionUnavailable()));
    expect(errorCode(await flow.locate(signal))).toBe('position_unavailable');
  });

  it.each([
    ['granted', 'error.locationTimeout'],
    ['prompt', 'error.locationTimeout'],
    ['unknown', 'error.locationTimeoutPromptPending'],
  ] as const)('a timeout reported by the port (permission %s) becomes the location timeout text %s', async (permission, key) => {
    const { location, flow, signal } = setup(permission);
    location.positionScript.respondWith(err(timeoutError()));
    const r = failure(await flow.locate(signal));
    expect(r.error).toEqual({ kind: 'timeout', messageKey: key });
  });

  it('an unexpected error code is reported as LOCATION_UNAVAILABLE', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(err(notFound()));
    expect(errorCode(await flow.locate(signal))).toBe('position_unavailable');
  });

  it('a throwing port becomes LOCATION_UNAVAILABLE, not a rejection', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.failWith(new Error('boom'));
    expect(errorCode(await flow.locate(signal))).toBe('position_unavailable');
  });

  it('permission is re-read on every call', async () => {
    const { location, flow, signal } = setup('prompt');
    location.positionScript.respondWith(coords);
    await flow.locate(signal);
    location.permission = 'denied';
    expect(errorCode(await flow.locate(signal))).toBe('permission_denied');
    expect(location.permissionCalls).toBe(2);
  });
});

describe('LocationFlow reverse geocoding', () => {
  const place = { ...sampleLocation, key: 'p:9', placeId: '9', name: 'Named Place', source: 'device' as const };

  it('uses the resolved name and exposes a favoritable place with source "search"', async () => {
    const { location, geocoding, flow, signal } = setup('granted', true);
    location.positionScript.respondWith(coords);
    geocoding.reverseScript?.respondWith(ok(place));
    const r = await flow.locate(signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.location).toMatchObject({
        name: 'Named Place',
        key: 'p:9',
        source: 'device',
        latitude: 12.34,
        longitude: 56.78,
        country: sampleLocation.country,
      });
      expect(r.value.resolvedPlace).toMatchObject({ key: 'p:9', source: 'search', latitude: place.latitude });
    }
    expect(geocoding.reverseScript?.calls[0]?.args).toEqual([12.34, 56.78]);
  });

  it('falls back to "Current location" when reverse fails or finds nothing', async () => {
    const { location, geocoding, flow, signal } = setup('granted', true);
    location.positionScript.respondWith(coords);
    for (const response of [err(serviceUnavailable()), err(notFound())]) {
      geocoding.reverseScript?.respondWith(response);
      const r = await flow.locate(signal);
      expect(r.ok && r.value.location.name).toBe('Current location');
      expect(r.ok && r.value.resolvedPlace).toBeUndefined();
    }
  });

  it('a throwing reverse falls back instead of failing the flow', async () => {
    const { location, geocoding, flow, signal } = setup('granted', true);
    location.positionScript.respondWith(coords);
    geocoding.reverseScript?.failWith(new Error('boom'));
    const r = await flow.locate(signal);
    expect(r.ok && r.value.location.name).toBe('Current location');
  });
});

describe('LocationFlow supersession', () => {
  it('a result arriving after abort is discarded', async () => {
    const { location, flow } = setup('granted');
    location.positionScript.hold();
    const controller = new AbortController();
    const p = flow.locate(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    expect(isAbortedResult(await p)).toBe(true);
  });

  it('a success that races the abort is still discarded', async () => {
    const { location, flow } = setup('granted');
    location.positionScript.hold();
    const controller = new AbortController();
    const p = flow.locate(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    location.positionScript.pending[0]?.resolve(coords);
    controller.abort();
    expect(isAbortedResult(await p)).toBe(true);
  });

  it('an already-aborted signal makes no port call', async () => {
    const { location, flow } = setup('granted');
    const controller = new AbortController();
    controller.abort();
    expect(isAbortedResult(await flow.locate(controller.signal))).toBe(true);
    expect(location.permissionCalls).toBe(0);
    expect(location.positionScript.callCount).toBe(0);
  });

  it('abort during the permission read discards the result without a position call', async () => {
    const { location, flow } = setup('granted');
    const controller = new AbortController();
    const p = flow.locate(controller.signal);
    controller.abort();
    expect(isAbortedResult(await p)).toBe(true);
    expect(location.positionScript.callCount).toBe(0);
  });

  it('abort during reverse geocoding discards the result', async () => {
    const { location, geocoding, flow } = setup('granted', true);
    location.positionScript.respondWith(coords);
    geocoding.reverseScript?.hold();
    const controller = new AbortController();
    const p = flow.locate(controller.signal);
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    geocoding.reverseScript?.pending[0]?.resolve(ok(sampleLocation));
    expect(isAbortedResult(await p)).toBe(true);
  });
});

describe('LocationFlow app-owned watchdog (architecture 3.3 step 2 and 4, DR-06, DR-20)', () => {
  /** Starts `locate` under fake timers with the position call held, and lets the permission read finish. */
  async function start(permission: PermissionState, hooks: LocateHooks = {}) {
    vi.useFakeTimers();
    const t = setup(permission);
    t.location.positionScript.hold();
    t.location.grantScript.hold(); // a prompt stays unanswered until a test grants it
    const controller = new AbortController();
    const result = t.flow.locate(controller.signal, hooks);
    await vi.advanceTimersByTimeAsync(0);
    return { ...t, controller, result };
  }

  it.each([
    ['granted', 'error.locationTimeout'],
    ['unknown', 'error.locationTimeoutPromptPending'],
  ] as const)('permission %s: the watchdog starts at the call and fires after locationTimeoutMs with %s', async (permission, key) => {
    const timedOut = vi.fn();
    await start(permission, { onTimedOut: timedOut });
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS - 1);
    expect(timedOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(timedOut).toHaveBeenCalledTimes(1);
    expect(timedOut).toHaveBeenCalledWith({ kind: 'timeout', messageKey: key });
  });

  it('the two timeout texts are the approved M-10 (prompt-wait hint) and M-11 (no hint)', () => {
    expect(message('error.locationTimeout')).toBe(
      'Finding your location took too long. You can search for a city instead, or choose Use my location to try again.',
    );
    expect(message('error.locationTimeoutPromptPending')).toBe(
      'Finding your location took too long. Your browser may still be waiting for your answer to its location prompt. You can search for a city instead, or choose Use my location to try again.',
    );
  });

  it('prompt: an unanswered prompt never starts the watchdog, so it is never reported as a timeout', async () => {
    const timedOut = vi.fn();
    const t = await start('prompt', { onTimedOut: timedOut });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(timedOut).not.toHaveBeenCalled();
    expect(t.location.grantScript.callCount).toBe(1); // the permission was being watched
    expect(t.location.positionScript.callCount).toBe(1); // the call was made: that is what shows the prompt
  });

  it('prompt then "Allow": the watchdog starts when the permission becomes granted, not before', async () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const t = setup('prompt');
    t.location.positionScript.hold();
    t.location.grantScript.hold();
    void t.flow.locate(t.signal, { onTimedOut: timedOut });
    await vi.advanceTimersByTimeAsync(5 * WATCHDOG_MS); // the user is still reading the prompt
    expect(timedOut).not.toHaveBeenCalled();
    t.location.grantScript.resolveNext(true);
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS - 1);
    expect(timedOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(timedOut).toHaveBeenCalledWith({ kind: 'timeout', messageKey: 'error.locationTimeout' });
  });

  it('prompt answered with "Block": the watchdog never starts', async () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const t = setup('prompt');
    t.location.positionScript.hold();
    t.location.grantScript.hold();
    const result = t.flow.locate(t.signal, { onTimedOut: timedOut });
    await vi.advanceTimersByTimeAsync(0);
    t.location.grantScript.resolveNext(false);
    t.location.positionScript.resolveNext(err(permissionDenied()));
    expect(errorCode(await result)).toBe('permission_denied');
    await vi.advanceTimersByTimeAsync(10 * WATCHDOG_MS);
    expect(timedOut).not.toHaveBeenCalled();
  });

  it('after the watchdog fires the call is not cancelled; a position that arrives later is still returned', async () => {
    const timedOut = vi.fn();
    const t = await start('granted', { onTimedOut: timedOut });
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS);
    expect(timedOut).toHaveBeenCalledTimes(1);
    expect(t.location.positionScript.calls[0]?.aborted).toBe(false);
    t.location.positionScript.resolveNext(coords);
    const r = await t.result;
    expect(r.ok).toBe(true);
    expect(timedOut).toHaveBeenCalledTimes(1);
  });

  it('after the watchdog fires, a late result is discarded once the caller has aborted', async () => {
    const t = await start('granted', { onTimedOut: vi.fn() });
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS);
    t.controller.abort();
    expect(isAbortedResult(await t.result)).toBe(true);
  });

  it('a position that arrives in time stops the watchdog: no timer is left and nothing fires', async () => {
    const timedOut = vi.fn();
    const t = await start('granted', { onTimedOut: timedOut });
    t.location.positionScript.resolveNext(coords);
    expect((await t.result).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * WATCHDOG_MS);
    expect(timedOut).not.toHaveBeenCalled();
  });

  it('a failure that arrives in time stops the watchdog too', async () => {
    const timedOut = vi.fn();
    const t = await start('unknown', { onTimedOut: timedOut });
    t.location.positionScript.resolveNext(err(positionUnavailable()));
    expect(errorCode(await t.result)).toBe('position_unavailable');
    expect(vi.getTimerCount()).toBe(0);
    expect(timedOut).not.toHaveBeenCalled();
  });

  it('an abort stops the watchdog: nothing fires afterwards', async () => {
    const timedOut = vi.fn();
    const t = await start('granted', { onTimedOut: timedOut });
    t.controller.abort();
    expect(isAbortedResult(await t.result)).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * WATCHDOG_MS);
    expect(timedOut).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('no watchdog runs when permission is denied or unsupported (no call is made)', async () => {
    vi.useFakeTimers();
    for (const permission of ['denied', 'unsupported'] as const) {
      const timedOut = vi.fn();
      const t = setup(permission);
      await t.flow.locate(t.signal, { onTimedOut: timedOut });
      expect(vi.getTimerCount()).toBe(0);
      expect(timedOut).not.toHaveBeenCalled();
    }
  });

  it('a throwing onTimedOut observer does not break the open attempt', async () => {
    const t = await start('granted', {
      onTimedOut: () => {
        throw new Error('boom');
      },
    });
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS);
    t.location.positionScript.resolveNext(coords);
    expect((await t.result).ok).toBe(true);
  });

  it('a port whose permission watch throws leaves the prompt wait open without a watchdog', async () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const t = setup('prompt');
    t.location.positionScript.hold();
    t.location.whenPermissionGranted = () => Promise.reject(new Error('boom'));
    void t.flow.locate(t.signal, { onTimedOut: timedOut });
    await vi.advanceTimersByTimeAsync(10 * WATCHDOG_MS);
    expect(timedOut).not.toHaveBeenCalled();
  });
});

describe('device coordinates stay in memory', () => {
  it('the flow module has no storage dependency', () => {
    expect(flowSource).not.toMatch(/KeyValueStore|localStorage|sessionStorage/);
  });
});

import { describe, expect, it } from 'vitest';
import { isAbortedResult } from '../../src/core/aborted';
import { createConfig } from '../../src/core/config';
import { locationDenied, locationUnavailable, notFound, serviceUnavailable, timeoutError } from '../../src/core/errors';
import { LocationFlow, UNRESOLVED_DEVICE_LOCATION_KEY } from '../../src/core/locationFlow';
import flowSource from '../../src/core/locationFlow.ts?raw';
import { err, ok } from '../../src/core/result';
import type { AppError } from '../../src/core/errors';
import { sampleLocation } from '../fixtures/domain';
import { FakeGeocodingProvider, FakeLocationService } from '../fakes';

const coords = ok({ lat: 12.34, lon: 56.78 });

function setup(permission: 'granted' | 'prompt' | 'denied' | 'unsupported', withReverse = false) {
  const location = new FakeLocationService(permission);
  const geocoding = new FakeGeocodingProvider({ withReverse });
  const flow = new LocationFlow({
    location,
    geocoding,
    config: createConfig({ locationTimeoutMs: 4000 }),
  });
  return { location, geocoding, flow, signal: new AbortController().signal };
}

function errorCode(r: unknown): string | undefined {
  const x = r as { ok: boolean; error?: AppError };
  return x.ok ? undefined : x.error?.code;
}

describe('LocationFlow outcomes (architecture 4.5 table)', () => {
  it('granted + coordinates: device location, label "Current location" when no reverse', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(coords);
    const r = await flow.locate(signal, { userInitiated: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.location).toMatchObject({
        source: 'device',
        name: 'Current location',
        latitude: 12.34,
        longitude: 56.78,
        key: `${UNRESOLVED_DEVICE_LOCATION_KEY}:12.34,56.78`,
      });
      expect(r.value.resolvedPlace).toBeUndefined();
    }
    expect(location.positionScript.calls[0]?.args).toEqual([4000]);
  });

  it('unresolved device locations at different coordinates get different keys (M1)', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(coords);
    const first = await flow.locate(signal, { userInitiated: true });
    location.positionScript.respondWith(ok({ lat: 50.5, lon: 60.6 }));
    const second = await flow.locate(signal, { userInitiated: true });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.location.key).not.toBe(second.value.location.key);
    }
  });

  it('granted at launch (not user initiated) auto-detects', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(coords);
    expect((await flow.locate(signal, { userInitiated: false })).ok).toBe(true);
    expect(location.positionScript.callCount).toBe(1);
  });

  it('prompt: no getCurrentPosition without a user action', async () => {
    const { location, flow, signal } = setup('prompt');
    const r = await flow.locate(signal, { userInitiated: false });
    expect(r).toEqual({ ok: false, needsUserAction: true });
    expect(location.positionScript.callCount).toBe(0);
  });

  it('prompt + user action calls getCurrentPosition (which triggers the platform prompt)', async () => {
    const { location, flow, signal } = setup('prompt');
    location.positionScript.respondWith(coords);
    expect((await flow.locate(signal, { userInitiated: true })).ok).toBe(true);
    expect(location.positionScript.callCount).toBe(1);
  });

  it('denied permission: LOCATION_DENIED without calling getCurrentPosition', async () => {
    const { location, flow, signal } = setup('denied');
    expect(errorCode(await flow.locate(signal, { userInitiated: true }))).toBe('LOCATION_DENIED');
    expect(location.positionScript.callCount).toBe(0);
  });

  it('unsupported: LOCATION_UNAVAILABLE without calling getCurrentPosition', async () => {
    const { location, flow, signal } = setup('unsupported');
    expect(errorCode(await flow.locate(signal, { userInitiated: true }))).toBe('LOCATION_UNAVAILABLE');
    expect(location.positionScript.callCount).toBe(0);
  });

  it.each([
    ['LOCATION_DENIED', locationDenied()],
    ['TIMEOUT', timeoutError()],
    ['LOCATION_UNAVAILABLE', locationUnavailable()],
  ])('position error %s is passed through', async (code, error) => {
    const { location, flow, signal } = setup('prompt');
    location.positionScript.respondWith(err(error));
    expect(errorCode(await flow.locate(signal, { userInitiated: true }))).toBe(code);
  });

  it('an unexpected error code is reported as LOCATION_UNAVAILABLE', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.respondWith(err(notFound()));
    expect(errorCode(await flow.locate(signal, { userInitiated: true }))).toBe('LOCATION_UNAVAILABLE');
  });

  it('a throwing port becomes LOCATION_UNAVAILABLE, not a rejection', async () => {
    const { location, flow, signal } = setup('granted');
    location.positionScript.failWith(new Error('boom'));
    expect(errorCode(await flow.locate(signal, { userInitiated: true }))).toBe('LOCATION_UNAVAILABLE');
  });

  it('permission is re-read on every call', async () => {
    const { location, flow, signal } = setup('prompt');
    location.positionScript.respondWith(coords);
    await flow.locate(signal, { userInitiated: true });
    location.permission = 'denied';
    expect(errorCode(await flow.locate(signal, { userInitiated: true }))).toBe('LOCATION_DENIED');
    expect(location.permissionCalls).toBe(2);
  });
});

describe('LocationFlow reverse geocoding', () => {
  const place = { ...sampleLocation, key: 'p:9', placeId: '9', name: 'Named Place', source: 'device' as const };

  it('uses the resolved name and exposes a favoritable place with source "search"', async () => {
    const { location, geocoding, flow, signal } = setup('granted', true);
    location.positionScript.respondWith(coords);
    geocoding.reverseScript?.respondWith(ok(place));
    const r = await flow.locate(signal, { userInitiated: true });
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
      const r = await flow.locate(signal, { userInitiated: true });
      expect(r.ok && r.value.location.name).toBe('Current location');
      expect(r.ok && r.value.resolvedPlace).toBeUndefined();
    }
  });

  it('a throwing reverse falls back instead of failing the flow', async () => {
    const { location, geocoding, flow, signal } = setup('granted', true);
    location.positionScript.respondWith(coords);
    geocoding.reverseScript?.failWith(new Error('boom'));
    const r = await flow.locate(signal, { userInitiated: true });
    expect(r.ok && r.value.location.name).toBe('Current location');
  });
});

describe('LocationFlow supersession', () => {
  it('a result arriving after abort is discarded', async () => {
    const { location, flow } = setup('granted');
    location.positionScript.hold();
    const controller = new AbortController();
    const p = flow.locate(controller.signal, { userInitiated: true });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    expect(isAbortedResult(await p)).toBe(true);
  });

  it('a success that races the abort is still discarded', async () => {
    const { location, flow } = setup('granted');
    location.positionScript.hold();
    const controller = new AbortController();
    const p = flow.locate(controller.signal, { userInitiated: true });
    await new Promise((r) => setTimeout(r, 0));
    location.positionScript.pending[0]?.resolve(coords);
    controller.abort();
    expect(isAbortedResult(await p)).toBe(true);
  });

  it('an already-aborted signal makes no port call', async () => {
    const { location, flow } = setup('granted');
    const controller = new AbortController();
    controller.abort();
    expect(isAbortedResult(await flow.locate(controller.signal, { userInitiated: true }))).toBe(true);
    expect(location.permissionCalls).toBe(0);
    expect(location.positionScript.callCount).toBe(0);
  });

  it('abort during the permission read discards the result without a position call', async () => {
    const { location, flow } = setup('granted');
    const controller = new AbortController();
    const p = flow.locate(controller.signal, { userInitiated: true });
    controller.abort();
    expect(isAbortedResult(await p)).toBe(true);
    expect(location.positionScript.callCount).toBe(0);
  });

  it('abort during reverse geocoding discards the result', async () => {
    const { location, geocoding, flow } = setup('granted', true);
    location.positionScript.respondWith(coords);
    geocoding.reverseScript?.hold();
    const controller = new AbortController();
    const p = flow.locate(controller.signal, { userInitiated: true });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    geocoding.reverseScript?.pending[0]?.resolve(ok(sampleLocation));
    expect(isAbortedResult(await p)).toBe(true);
  });
});

describe('device coordinates stay in memory', () => {
  it('the flow module has no storage dependency', () => {
    expect(flowSource).not.toMatch(/KeyValueStore|localStorage|sessionStorage/);
  });
});

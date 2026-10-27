import { describe, expect, it } from 'vitest';
import { BrowserLocationService } from '../../src/adapters/web/geolocation';
import type { GeolocationLike, PermissionsLike } from '../../src/adapters/web/geolocation';
import { isAborted } from '../../src/core/ports';

type Success = Parameters<GeolocationLike['getCurrentPosition']>[0];
type Failure = Parameters<GeolocationLike['getCurrentPosition']>[1];

/** Geolocation stub whose behavior the test supplies. */
function stubGeo(behavior: (success: Success, failure: Failure, options?: { timeout?: number }) => void) {
  const calls: Array<{ timeout?: number }> = [];
  const geo: GeolocationLike = {
    getCurrentPosition: (s, f, o) => {
      calls.push(o ?? {});
      behavior(s, f, o);
    },
  };
  return { geo, calls };
}

const permissionsReturning = (state: string): PermissionsLike => ({ query: async () => ({ state }) });

describe('getPermissionState', () => {
  const geo = stubGeo(() => {}).geo;

  it.each(['granted', 'denied', 'prompt'] as const)('maps Permissions API state %s', async (state) => {
    const svc = new BrowserLocationService({ geolocation: geo, permissions: permissionsReturning(state) });
    expect(await svc.getPermissionState()).toBe(state);
  });

  it('Permissions API absent: prompt (never a guess of granted)', async () => {
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    expect(await svc.getPermissionState()).toBe('prompt');
  });

  it('Permissions API rejects or throws: prompt', async () => {
    const rejecting: PermissionsLike = { query: () => Promise.reject(new TypeError('unsupported name')) };
    const throwing: PermissionsLike = {
      query: () => {
        throw new Error('boom');
      },
    };
    for (const permissions of [rejecting, throwing]) {
      const svc = new BrowserLocationService({ geolocation: geo, permissions });
      expect(await svc.getPermissionState()).toBe('prompt');
    }
  });

  it('an unrecognized state value: prompt', async () => {
    const svc = new BrowserLocationService({ geolocation: geo, permissions: permissionsReturning('weird') });
    expect(await svc.getPermissionState()).toBe('prompt');
  });

  it('Geolocation absent: unsupported', async () => {
    const svc = new BrowserLocationService({ geolocation: undefined, permissions: permissionsReturning('granted') });
    expect(await svc.getPermissionState()).toBe('unsupported');
  });

  it('default dependencies in a non-browser environment do not throw', async () => {
    const state = await new BrowserLocationService().getPermissionState();
    expect(['unsupported', 'prompt', 'granted', 'denied']).toContain(state);
  });
});

describe('getCurrentPosition', () => {
  const signal = () => new AbortController().signal;

  it('returns coordinates and passes the timeout to the browser', async () => {
    const { geo, calls } = stubGeo((success) => success({ coords: { latitude: 1.5, longitude: -2.5 } }));
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    expect(await svc.getCurrentPosition(7000, signal())).toEqual({ ok: true, value: { lat: 1.5, lon: -2.5 } });
    expect(calls[0]?.timeout).toBe(7000);
  });

  it.each([
    [1, 'LOCATION_DENIED'],
    [2, 'LOCATION_UNAVAILABLE'],
    [3, 'TIMEOUT'],
    [99, 'LOCATION_UNAVAILABLE'],
  ])('maps browser error code %i to %s', async (code, expected) => {
    const { geo } = stubGeo((_s, failure) => failure({ code }));
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const r = await svc.getCurrentPosition(1000, signal());
    expect(!r.ok && !isAborted(r) && r.error.code).toBe(expected);
  });

  it('non-finite coordinates are LOCATION_UNAVAILABLE', async () => {
    const { geo } = stubGeo((success) => success({ coords: { latitude: Number.NaN, longitude: 1 } }));
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const r = await svc.getCurrentPosition(1000, signal());
    expect(!r.ok && !isAborted(r) && r.error.code).toBe('LOCATION_UNAVAILABLE');
  });

  it('Geolocation absent: LOCATION_UNAVAILABLE', async () => {
    const svc = new BrowserLocationService({ geolocation: undefined, permissions: undefined });
    const r = await svc.getCurrentPosition(1000, signal());
    expect(!r.ok && !isAborted(r) && r.error.code).toBe('LOCATION_UNAVAILABLE');
  });

  it('a synchronously throwing browser API becomes LOCATION_UNAVAILABLE', async () => {
    const { geo } = stubGeo(() => {
      throw new Error('boom');
    });
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const r = await svc.getCurrentPosition(1000, signal());
    expect(!r.ok && !isAborted(r) && r.error.code).toBe('LOCATION_UNAVAILABLE');
  });

  it('abort before the browser answers settles with ABORTED, and a late answer is ignored', async () => {
    let success: Success | undefined;
    const { geo } = stubGeo((s) => {
      success = s;
    });
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const controller = new AbortController();
    const pending = svc.getCurrentPosition(1000, controller.signal);
    controller.abort();
    const result = await pending;
    expect(isAborted(result)).toBe(true);
    expect(result).toEqual({ ok: false, aborted: true });
    success?.({ coords: { latitude: 1, longitude: 2 } }); // must not throw or change anything
  });

  it('an already-aborted signal settles with ABORTED without calling the browser', async () => {
    const { geo, calls } = stubGeo(() => {});
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const controller = new AbortController();
    controller.abort();
    expect(isAborted(await svc.getCurrentPosition(1000, controller.signal))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('an answer after an earlier success cannot change the settled result', async () => {
    let success: Success | undefined;
    let failure: Failure | undefined;
    const { geo } = stubGeo((s, f) => {
      success = s;
      failure = f;
      s({ coords: { latitude: 1, longitude: 2 } });
    });
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const r = await svc.getCurrentPosition(1000, signal());
    failure?.({ code: 1 });
    success?.({ coords: { latitude: 9, longitude: 9 } });
    expect(r).toEqual({ ok: true, value: { lat: 1, lon: 2 } });
  });
});

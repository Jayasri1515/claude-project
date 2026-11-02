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

  it('Permissions API absent: unknown (never a guess of granted, and apart from a real "prompt")', async () => {
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    expect(await svc.getPermissionState()).toBe('unknown');
  });

  it('Permissions API rejects or throws: unknown', async () => {
    const rejecting: PermissionsLike = { query: () => Promise.reject(new TypeError('unsupported name')) };
    const throwing: PermissionsLike = {
      query: () => {
        throw new Error('boom');
      },
    };
    for (const permissions of [rejecting, throwing]) {
      const svc = new BrowserLocationService({ geolocation: geo, permissions });
      expect(await svc.getPermissionState()).toBe('unknown');
    }
  });

  it('an unrecognized state value: unknown', async () => {
    const svc = new BrowserLocationService({ geolocation: geo, permissions: permissionsReturning('weird') });
    expect(await svc.getPermissionState()).toBe('unknown');
  });

  it('Geolocation absent: unsupported', async () => {
    const svc = new BrowserLocationService({ geolocation: undefined, permissions: permissionsReturning('granted') });
    expect(await svc.getPermissionState()).toBe('unsupported');
  });

  it('default dependencies in a non-browser environment do not throw', async () => {
    const state = await new BrowserLocationService().getPermissionState();
    expect(['unsupported', 'unknown', 'prompt', 'granted', 'denied']).toContain(state);
  });
});

/** A PermissionStatus stand-in whose state the test changes, firing the registered "change" listeners. */
function changingStatus(initial: string) {
  const listeners = new Set<() => void>();
  const status = {
    state: initial,
    addEventListener: (_type: 'change', listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => void listeners.delete(listener),
  };
  const change = (state: string): void => {
    status.state = state;
    for (const listener of [...listeners]) listener();
  };
  return { status, change, listenerCount: () => listeners.size };
}

describe('whenPermissionGranted', () => {
  const geo = stubGeo(() => {}).geo;
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('already granted: true at once', async () => {
    const svc = new BrowserLocationService({ geolocation: geo, permissions: permissionsReturning('granted') });
    expect(await svc.whenPermissionGranted(new AbortController().signal)).toBe(true);
  });

  it('already denied: false at once', async () => {
    const svc = new BrowserLocationService({ geolocation: geo, permissions: permissionsReturning('denied') });
    expect(await svc.whenPermissionGranted(new AbortController().signal)).toBe(false);
  });

  it('prompt: stays pending until the state changes to granted, then true, and the listener is removed', async () => {
    const { status, change, listenerCount } = changingStatus('prompt');
    const svc = new BrowserLocationService({ geolocation: geo, permissions: { query: async () => status } });
    let result: boolean | undefined;
    void svc.whenPermissionGranted(new AbortController().signal).then((r) => (result = r));
    await flush();
    expect(result).toBeUndefined(); // an unanswered prompt is not an answer
    expect(listenerCount()).toBe(1);
    change('granted');
    await flush();
    expect(result).toBe(true);
    expect(listenerCount()).toBe(0);
  });

  it('prompt then denied: false', async () => {
    const { status, change } = changingStatus('prompt');
    const svc = new BrowserLocationService({ geolocation: geo, permissions: { query: async () => status } });
    const pending = svc.whenPermissionGranted(new AbortController().signal);
    await flush();
    change('denied');
    expect(await pending).toBe(false);
  });

  it('abort while waiting: false, and the listener is removed', async () => {
    const { status, listenerCount } = changingStatus('prompt');
    const svc = new BrowserLocationService({ geolocation: geo, permissions: { query: async () => status } });
    const controller = new AbortController();
    const pending = svc.whenPermissionGranted(controller.signal);
    await flush();
    controller.abort();
    expect(await pending).toBe(false);
    expect(listenerCount()).toBe(0);
  });

  it('cannot be watched (no Permissions API, query rejects, no change events): false, never a hang', async () => {
    const aborted = new AbortController().signal;
    expect(await new BrowserLocationService({ geolocation: geo, permissions: undefined }).whenPermissionGranted(aborted)).toBe(false);
    const rejecting: PermissionsLike = { query: () => Promise.reject(new TypeError('unsupported name')) };
    expect(await new BrowserLocationService({ geolocation: geo, permissions: rejecting }).whenPermissionGranted(aborted)).toBe(false);
    const svc = new BrowserLocationService({ geolocation: geo, permissions: permissionsReturning('prompt') });
    expect(await svc.whenPermissionGranted(aborted)).toBe(false); // the stub has no addEventListener
  });

  it('an already-aborted signal: false without querying', async () => {
    let queried = false;
    const permissions: PermissionsLike = { query: async () => ((queried = true), { state: 'granted' }) };
    const controller = new AbortController();
    controller.abort();
    const svc = new BrowserLocationService({ geolocation: geo, permissions });
    expect(await svc.whenPermissionGranted(controller.signal)).toBe(false);
    expect(queried).toBe(false);
  });
});

describe('getCurrentPosition', () => {
  const signal = () => new AbortController().signal;

  it('returns coordinates and passes NO options to the browser, so there is no browser timeout (architecture 3.3, DR-06)', async () => {
    let received: unknown[] = [];
    const geo: GeolocationLike = {
      getCurrentPosition: (...args) => {
        received = args.slice(2);
        args[0]({ coords: { latitude: 1.5, longitude: -2.5 } });
      },
    };
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    expect(await svc.getCurrentPosition(signal())).toEqual({ ok: true, value: { lat: 1.5, lon: -2.5 } });
    expect(received).toEqual([]); // not even an empty options object, let alone `timeout`
  });

  it('a call that is never answered stays pending: the adapter adds no timeout of its own', async () => {
    const { geo } = stubGeo(() => {});
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    let settled = false;
    void svc.getCurrentPosition(signal()).then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
  });

  it.each([
    [1, 'permission_denied'],
    [2, 'position_unavailable'],
    [3, 'timeout'],
    [99, 'position_unavailable'],
  ])('maps browser error code %i to %s', async (code, expected) => {
    const { geo } = stubGeo((_s, failure) => failure({ code }));
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const r = await svc.getCurrentPosition(signal());
    expect(!r.ok && !isAborted(r) && r.error.kind).toBe(expected);
  });

  it('non-finite coordinates are LOCATION_UNAVAILABLE', async () => {
    const { geo } = stubGeo((success) => success({ coords: { latitude: Number.NaN, longitude: 1 } }));
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const r = await svc.getCurrentPosition(signal());
    expect(!r.ok && !isAborted(r) && r.error.kind).toBe('position_unavailable');
  });

  it('Geolocation absent: LOCATION_UNAVAILABLE', async () => {
    const svc = new BrowserLocationService({ geolocation: undefined, permissions: undefined });
    const r = await svc.getCurrentPosition(signal());
    expect(!r.ok && !isAborted(r) && r.error.kind).toBe('position_unavailable');
  });

  it('a synchronously throwing browser API becomes LOCATION_UNAVAILABLE', async () => {
    const { geo } = stubGeo(() => {
      throw new Error('boom');
    });
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const r = await svc.getCurrentPosition(signal());
    expect(!r.ok && !isAborted(r) && r.error.kind).toBe('position_unavailable');
  });

  it('abort before the browser answers settles with ABORTED, and a late answer is ignored', async () => {
    let success: Success | undefined;
    const { geo } = stubGeo((s) => {
      success = s;
    });
    const svc = new BrowserLocationService({ geolocation: geo, permissions: undefined });
    const controller = new AbortController();
    const pending = svc.getCurrentPosition(controller.signal);
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
    expect(isAborted(await svc.getCurrentPosition(controller.signal))).toBe(true);
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
    const r = await svc.getCurrentPosition(signal());
    failure?.({ code: 1 });
    success?.({ coords: { latitude: 9, longitude: 9 } });
    expect(r).toEqual({ ok: true, value: { lat: 1, lon: 2 } });
  });
});

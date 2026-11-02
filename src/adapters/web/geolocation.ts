/**
 * LegacyLocationService over the browser Geolocation API (architecture 5.3; FR-008 to
 * FR-012, EC-007 to EC-009, NFR-005, D-002, F-009, F-010).
 *
 * - getPermissionState uses the Permissions API when present. If it is absent,
 *   throws, rejects or reports an unrecognised value, the answer is 'unknown',
 *   so the Location Flow can tell a prompt wait from a slow fix (architecture
 *   3.3 step 2). A missing Geolocation API is 'unsupported'.
 * - getCurrentPosition passes NO timeout option to the browser (the watchdog is
 *   app-owned, architecture 3.3 and DR-06; browsers may or may not count the
 *   prompt time towards their own timeout, which is unverified). It maps error
 *   codes and resolves to ABORTED if the signal fires first. The Geolocation
 *   API cannot cancel an outstanding request, so a late browser callback is
 *   ignored.
 * - whenPermissionGranted resolves true when the Permissions API reports the
 *   state changing to 'granted'.
 * - Methods never throw and the returned promise always settles.
 */
import { permissionDenied, positionUnavailable, timeoutError } from '../../core/errors';
import { ABORTED } from '../../core/ports';
import type { LegacyLocationService, PermissionState, PositionResult } from '../../core/ports';
import { err, ok } from '../../core/result';

/** Geolocation API error codes (GeolocationPositionError). */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

export interface GeolocationLike {
  getCurrentPosition(
    success: (position: { coords: { latitude: number; longitude: number } }) => void,
    error: (error: { code: number }) => void,
    options?: { timeout?: number },
  ): void; // `options` stays in the type only so tests can assert that none is passed.
}

/** The part of a `PermissionStatus` used here. The change events are optional so a minimal stub still fits. */
export interface PermissionStatusLike {
  readonly state: string;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

export interface PermissionsLike {
  query(descriptor: { name: 'geolocation' }): Promise<PermissionStatusLike>;
}

export interface BrowserLocationDeps {
  readonly geolocation: GeolocationLike | undefined;
  readonly permissions: PermissionsLike | undefined;
}

function defaultDeps(): BrowserLocationDeps {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return { geolocation: nav?.geolocation, permissions: nav?.permissions };
}

export class BrowserLocationService implements LegacyLocationService {
  private readonly deps: BrowserLocationDeps;

  constructor(deps: BrowserLocationDeps = defaultDeps()) {
    this.deps = deps;
  }

  async getPermissionState(): Promise<PermissionState> {
    if (this.deps.geolocation === undefined) return 'unsupported';
    const permissions = this.deps.permissions;
    if (permissions === undefined) return 'unknown';
    try {
      const status = await permissions.query({ name: 'geolocation' });
      if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
        return status.state;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  whenPermissionGranted(signal: AbortSignal): Promise<boolean> {
    const permissions = this.deps.permissions;
    if (permissions === undefined || signal.aborted) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let status: PermissionStatusLike | undefined;
      let settled = false;
      const finish = (granted: boolean): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        try {
          status?.removeEventListener?.('change', onChange);
        } catch {
          // A faulty status object must not leave the promise pending.
        }
        resolve(granted);
      };
      const onAbort = (): void => finish(false);
      const onChange = (): void => {
        if (status?.state === 'granted') finish(true);
        else if (status?.state === 'denied') finish(false);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (settled) return;
          status = result;
          if (result.state === 'granted') return finish(true);
          if (result.state === 'denied' || result.addEventListener === undefined) return finish(false);
          result.addEventListener('change', onChange);
        })
        .catch(() => finish(false));
    });
  }

  getCurrentPosition(signal: AbortSignal): Promise<PositionResult> {
    const geolocation = this.deps.geolocation;
    if (signal.aborted) return Promise.resolve(ABORTED);
    if (geolocation === undefined) return Promise.resolve(err(positionUnavailable()));

    return new Promise<PositionResult>((resolve) => {
      let settled = false;
      const finish = (result: PositionResult): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      };
      const onAbort = (): void => finish(ABORTED);
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        // No options: in particular no `timeout` (architecture 3.3, DR-06). The default is no limit.
        geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
              finish(ok({ lat: latitude, lon: longitude }));
            } else {
              finish(err(positionUnavailable()));
            }
          },
          (error) => {
            if (error.code === PERMISSION_DENIED) finish(err(permissionDenied()));
            else if (error.code === TIMEOUT) finish(err(timeoutError()));
            else if (error.code === POSITION_UNAVAILABLE) finish(err(positionUnavailable()));
            else finish(err(positionUnavailable()));
          },
        );
      } catch {
        finish(err(positionUnavailable()));
      }
    });
  }
}

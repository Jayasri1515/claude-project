/**
 * LocationService over the browser Geolocation API (architecture 5.3; FR-008 to
 * FR-012, EC-007 to EC-009, NFR-005, D-002, F-009, F-010).
 *
 * - getPermissionState uses the Permissions API when present. If it is absent,
 *   throws, rejects or reports an unknown value, the answer is 'prompt' (the
 *   portability rule), so launch auto-detect never runs on a guess. A missing
 *   Geolocation API is 'unsupported'.
 * - getCurrentPosition passes the timeout to the browser, maps error codes, and
 *   resolves to ABORTED if the signal fires first. The Geolocation API cannot
 *   cancel an outstanding request, so a late browser callback is ignored. The
 *   browser's timeout does not start until the user answers a permission prompt.
 * - Methods never throw and the returned promise always settles.
 */
import { locationDenied, locationUnavailable, timeoutError } from '../../core/errors';
import { ABORTED } from '../../core/ports';
import type { LocationService, PermissionState, PositionResult } from '../../core/ports';
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
  ): void;
}

export interface PermissionsLike {
  query(descriptor: { name: 'geolocation' }): Promise<{ state: string }>;
}

export interface BrowserLocationDeps {
  readonly geolocation: GeolocationLike | undefined;
  readonly permissions: PermissionsLike | undefined;
}

function defaultDeps(): BrowserLocationDeps {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return { geolocation: nav?.geolocation, permissions: nav?.permissions };
}

export class BrowserLocationService implements LocationService {
  private readonly deps: BrowserLocationDeps;

  constructor(deps: BrowserLocationDeps = defaultDeps()) {
    this.deps = deps;
  }

  async getPermissionState(): Promise<PermissionState> {
    if (this.deps.geolocation === undefined) return 'unsupported';
    const permissions = this.deps.permissions;
    if (permissions === undefined) return 'prompt';
    try {
      const status = await permissions.query({ name: 'geolocation' });
      if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
        return status.state;
      }
      return 'prompt';
    } catch {
      return 'prompt';
    }
  }

  getCurrentPosition(timeoutMs: number, signal: AbortSignal): Promise<PositionResult> {
    const geolocation = this.deps.geolocation;
    if (signal.aborted) return Promise.resolve(ABORTED);
    if (geolocation === undefined) return Promise.resolve(err(locationUnavailable()));

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
        geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
              finish(ok({ lat: latitude, lon: longitude }));
            } else {
              finish(err(locationUnavailable()));
            }
          },
          (error) => {
            if (error.code === PERMISSION_DENIED) finish(err(locationDenied()));
            else if (error.code === TIMEOUT) finish(err(timeoutError()));
            else if (error.code === POSITION_UNAVAILABLE) finish(err(locationUnavailable()));
            else finish(err(locationUnavailable()));
          },
          { timeout: timeoutMs },
        );
      } catch {
        finish(err(locationUnavailable()));
      }
    });
  }
}

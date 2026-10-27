/**
 * Location Flow (C5, architecture 4.5 and Flow B; FR-008 to FR-012, NFR-005,
 * EC-007 to EC-009).
 *
 * Translates LocationService outcomes into a result the App Controller can act
 * on. Every failure leaves the city search available (the flow holds no state
 * that could block it). Device coordinates live only in the returned Location,
 * in memory; this module has no storage dependency (F-004).
 *
 * Staleness: the caller aborts `signal` when the selection changes. A result
 * that arrives after that is dropped and ABORTED is returned, so it cannot
 * replace a city the user has since chosen (F-007).
 */
import type { Aborted } from './aborted';
import { ABORTED } from './aborted';
import type { Config } from './config';
import type { Location } from './domain';
import { locationDenied, locationUnavailable } from './errors';
import type { AppError } from './errors';
import { message } from './messages';
import type { GeocodingProvider, LocationService, PermissionState } from './ports';
import { isAborted } from './ports';
import { err, ok } from './result';
import type { Err, Ok } from './result';

/** The device position as a Location, plus the named place it resolved to, if any. */
export interface DeviceLocation {
  /**
   * `source: 'device'`, with the device coordinates. Name, region, country and
   * time zone come from reverse geocoding when it resolved, else the name is
   * the generic "Current location" label. When resolved, `key` is the resolved
   * place's key (so favorite detection works); otherwise a key derived from the
   * coordinates (in memory only).
   */
  readonly location: Location;
  /**
   * Present only when reverse geocoding produced a named place. It carries the
   * place's own coordinates and `source: 'search'`, and is the only thing that
   * may be saved as a favorite (architecture 4.7).
   */
  readonly resolvedPlace?: Location;
}

/** At launch the permission is not positively 'granted': wait for the user to ask. */
export interface NeedsUserAction {
  readonly ok: false;
  readonly needsUserAction: true;
}

export type LocateResult = Ok<DeviceLocation> | Err<AppError> | NeedsUserAction | Aborted;

export interface LocateOptions {
  /**
   * True when the user pressed "Use my location". False for launch auto-detect,
   * which proceeds only if the permission is positively 'granted' and never
   * causes a permission prompt (F-001).
   */
  readonly userInitiated: boolean;
}

/**
 * Prefix of the key of a device location that did not resolve to a named place.
 * The key also carries the coordinates, so a second reading from another place
 * is a different location and never inherits the first one's weather (FR-029
 * retention applies to the same place only). The key lives in memory only:
 * an unresolved device location is never saved as a favorite.
 */
export const UNRESOLVED_DEVICE_LOCATION_KEY = 'device:current';

export function unresolvedDeviceLocationKey(lat: number, lon: number): string {
  return `${UNRESOLVED_DEVICE_LOCATION_KEY}:${lat},${lon}`;
}

export interface LocationFlowDeps {
  readonly location: LocationService;
  /** Only its optional `reverse` is used. */
  readonly geocoding?: Pick<GeocodingProvider, 'reverse'>;
  readonly config: Pick<Config, 'locationTimeoutMs'>;
}

export class LocationFlow {
  private readonly service: LocationService;
  private readonly geocoding: Pick<GeocodingProvider, 'reverse'> | undefined;
  private readonly config: Pick<Config, 'locationTimeoutMs'>;

  constructor(deps: LocationFlowDeps) {
    this.service = deps.location;
    this.geocoding = deps.geocoding;
    this.config = deps.config;
  }

  /** Current permission state, re-read on every call. A throwing port reads as 'prompt'. */
  async getPermissionState(): Promise<PermissionState> {
    try {
      return await this.service.getPermissionState();
    } catch {
      return 'prompt';
    }
  }

  async locate(signal: AbortSignal, options: LocateOptions): Promise<LocateResult> {
    if (signal.aborted) return ABORTED;

    const permission = await this.getPermissionState();
    if (signal.aborted) return ABORTED;

    // Architecture 4.5 table.
    if (permission === 'denied') return err(locationDenied());
    if (permission === 'unsupported') return err(locationUnavailable());
    if (permission === 'prompt' && !options.userInitiated) {
      return { ok: false, needsUserAction: true };
    }

    // For 'prompt', this call is what makes the platform ask, and only a user action reaches it.
    let position;
    try {
      position = await this.service.getCurrentPosition(this.config.locationTimeoutMs, signal);
    } catch {
      if (signal.aborted) return ABORTED;
      return err(locationUnavailable());
    }
    if (signal.aborted || isAborted(position)) return ABORTED;
    if (!position.ok) {
      const code = position.error.code;
      // Only the three documented codes are meaningful here; anything else is "unavailable".
      if (code === 'LOCATION_DENIED' || code === 'LOCATION_UNAVAILABLE' || code === 'TIMEOUT') {
        return err(position.error);
      }
      return err(locationUnavailable());
    }

    const { lat, lon } = position.value;
    const resolvedPlace = await this.reverse(lat, lon, signal);
    if (signal.aborted) return ABORTED;

    const base = {
      latitude: lat,
      longitude: lon,
      source: 'device' as const,
    };
    const location: Location =
      resolvedPlace === undefined
        ? { key: unresolvedDeviceLocationKey(lat, lon), name: message('ui.currentLocation'), ...base }
        : {
            key: resolvedPlace.key,
            name: resolvedPlace.name,
            ...(resolvedPlace.admin1 !== undefined ? { admin1: resolvedPlace.admin1 } : {}),
            ...(resolvedPlace.country !== undefined ? { country: resolvedPlace.country } : {}),
            ...(resolvedPlace.timezone !== undefined ? { timezone: resolvedPlace.timezone } : {}),
            ...(resolvedPlace.placeId !== undefined ? { placeId: resolvedPlace.placeId } : {}),
            ...base,
          };
    return ok(resolvedPlace === undefined ? { location } : { location, resolvedPlace });
  }

  /** Named place for the coordinates, or undefined when reverse is absent, fails or finds nothing. */
  private async reverse(lat: number, lon: number, signal: AbortSignal): Promise<Location | undefined> {
    const reverse = this.geocoding?.reverse;
    if (reverse === undefined) return undefined;
    try {
      const result = await reverse.call(this.geocoding, lat, lon, signal);
      if (!result.ok || result.value.name.trim() === '') return undefined;
      return { ...result.value, source: 'search' };
    } catch {
      return undefined;
    }
  }
}

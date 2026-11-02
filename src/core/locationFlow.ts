/**
 * Location Flow (C5, architecture 3.3; REQ-WF2-01 to REQ-WF2-05, NFR-005,
 * EC-007 to EC-009).
 *
 * Translates LegacyLocationService outcomes into a result the App Controller can act
 * on. Every failure leaves the city search available (the flow holds no state
 * that could block it). Device coordinates live only in the returned Location,
 * in memory; this module has no storage dependency (F-004).
 *
 * The location is requested whenever `locate` is called, including at app open: the call is what makes the browser ask
 * for permission (REQ-WF2-02). The flow owns the one watchdog (architecture 3.3, DR-06) and passes no timeout to the
 * browser:
 * - permission 'granted', or no usable Permissions API ('unknown'): the watchdog starts at the call;
 * - permission 'prompt': it starts only when the platform reports 'granted' (`whenPermissionGranted`), so an
 *   unanswered prompt is never reported as a timeout (DR-20 is covered by the always-visible "search instead" cue);
 * - 'denied' or 'unsupported': no call is made.
 * When the watchdog fires, `onTimedOut` is told and the pending call is NOT cancelled (it cannot be). If the position
 * arrives later and the caller has not aborted `signal` meanwhile, `locate` resolves with it as usual.
 *
 * Staleness: the caller aborts `signal` when the selection changes. A result
 * that arrives after that is dropped and ABORTED is returned, so it cannot
 * replace a city the user has since chosen (F-007).
 */
import type { Aborted } from './aborted';
import { ABORTED } from './aborted';
import type { Config } from './config';
import type { Location } from './domain';
import { locationTimeout, locationTimeoutPromptPending, permissionDenied, positionUnavailable, unsupported } from './errors';
import type { AppError } from './errors';
import { message } from './messages';
import type { MessageId } from './messages';
import type { LegacyGeocodingProvider, LegacyLocationService, PermissionState } from './ports';
import { isAborted } from './ports';
import { err, ok } from './result';
import type { Ok } from './result';

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

/** A failed attempt. `hint` is a second message to show under the error (M-08, with a denial the platform reports). */
export interface LocateFailure {
  readonly ok: false;
  readonly error: AppError;
  readonly hint?: MessageId;
}

export type LocateResult = Ok<DeviceLocation> | LocateFailure | Aborted;

export interface LocateHooks {
  /**
   * Called once when the watchdog fires before a position or an error has arrived (architecture 3.3 step 4). The
   * attempt is still open: `locate` keeps waiting and may still resolve with a late position.
   */
  readonly onTimedOut?: (error: AppError) => void;
}

/**
 * Prefix of the key of a device location that did not resolve to a named place.
 * The key is opaque (a counter): it never contains or is derived from the coordinates, so nothing that renders,
 * stores or logs a key can reveal them (architecture 3.7, conformance F-09). A reading at the same coordinates as the
 * previous unresolved one reuses its key (FR-029 retention applies to the same place only); another reading gets a
 * new key and never inherits the first one's weather. The key lives in memory only: an unresolved device location is
 * never saved as a favorite.
 */
export const UNRESOLVED_DEVICE_LOCATION_KEY = 'device:current';

/**
 * The location timeout error. Without a Permissions API the watchdog started at the call, so the browser prompt may
 * still be waiting for an answer and the text says so (M-10). Otherwise the permission was known to be granted (M-11).
 */
function timeoutFor(permission: PermissionState): AppError {
  return permission === 'unknown' ? locationTimeoutPromptPending() : locationTimeout();
}

export interface LocationFlowDeps {
  readonly location: LegacyLocationService;
  /** Only its optional `reverse` is used. */
  readonly geocoding?: Pick<LegacyGeocodingProvider, 'reverse'>;
  readonly config: Pick<Config, 'locationTimeoutMs'>;
}

export class LocationFlow {
  private readonly service: LegacyLocationService;
  private readonly geocoding: Pick<LegacyGeocodingProvider, 'reverse'> | undefined;
  private readonly config: Pick<Config, 'locationTimeoutMs'>;
  /** Last unresolved reading and its opaque key; the only place the coordinates are compared. */
  private lastUnresolved: { readonly lat: number; readonly lon: number; readonly key: string } | undefined;
  private unresolvedCount = 0;

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

  async locate(signal: AbortSignal, hooks: LocateHooks = {}): Promise<LocateResult> {
    if (signal.aborted) return ABORTED;

    const permission = await this.getPermissionState();
    if (signal.aborted) return ABORTED;

    // Architecture 3.3: 'denied' goes straight to the denied outcome and 'unsupported' to unsupported, with no call.
    // The Permissions API itself reported the denial, so the "allow it in settings" hint applies (M-08).
    if (permission === 'denied') return { ok: false, error: permissionDenied(), hint: 'ui.location.deniedHint' };
    if (permission === 'unsupported') return err(unsupported());

    // This call is what makes the platform ask for permission when the state is 'prompt' (REQ-WF2-02).
    const watchdog = this.armWatchdog(permission, signal, hooks);
    let position;
    try {
      position = await this.service.getCurrentPosition(signal);
    } catch {
      if (signal.aborted) return ABORTED;
      return err(positionUnavailable());
    } finally {
      watchdog.cancel();
    }
    if (signal.aborted || isAborted(position)) return ABORTED;
    if (!position.ok) {
      const kind = position.error.kind;
      if (kind === 'permission_denied') {
        // The hint belongs to a denial the Permissions API reports. Reading it again also covers a prompt the user
        // just answered with "Block", which the platform reports as denied from then on.
        const apiReportsDenied = (await this.getPermissionState()) === 'denied';
        if (signal.aborted) return ABORTED;
        return apiReportsDenied
          ? { ok: false, error: position.error, hint: 'ui.location.deniedHint' }
          : err(position.error);
      }
      if (kind === 'timeout') return err(timeoutFor(permission));
      // Only the documented kinds are meaningful here; anything else is "unavailable".
      return err(positionUnavailable());
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
        ? { key: this.unresolvedKey(lat, lon), name: message('ui.currentLocation'), ...base }
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

  /**
   * The one watchdog (architecture 3.3 step 2). Returns a handle whose `cancel` stops it for good, including a start
   * that is still waiting for the permission to be granted.
   */
  private armWatchdog(permission: PermissionState, signal: AbortSignal, hooks: LocateHooks): { cancel(): void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const start = (): void => {
      if (cancelled || timer !== undefined) return;
      timer = setTimeout(() => {
        if (cancelled || signal.aborted) return;
        try {
          hooks.onTimedOut?.(timeoutFor(permission));
        } catch {
          // A faulty observer must not break the attempt that is still open.
        }
      }, this.config.locationTimeoutMs);
    };

    if (permission === 'prompt') {
      // The user may take as long as they like to answer the prompt: start only once the platform says 'granted'.
      void this.permissionGranted(signal).then((granted) => {
        if (granted) start();
      });
    } else {
      // 'granted', or no Permissions API ('unknown'), where a prompt wait cannot be told from a slow fix.
      start();
    }
    return {
      cancel: () => {
        cancelled = true;
        if (timer !== undefined) clearTimeout(timer);
      },
    };
  }

  /** True when the platform reports the permission changing to 'granted'. A port that cannot watch, or throws, is false. */
  private async permissionGranted(signal: AbortSignal): Promise<boolean> {
    try {
      return (await this.service.whenPermissionGranted?.(signal)) === true;
    } catch {
      return false;
    }
  }

  private unresolvedKey(lat: number, lon: number): string {
    const last = this.lastUnresolved;
    if (last !== undefined && last.lat === lat && last.lon === lon) return last.key;
    this.unresolvedCount += 1;
    const key = `${UNRESOLVED_DEVICE_LOCATION_KEY}:${this.unresolvedCount}`;
    this.lastUnresolved = { lat, lon, key };
    return key;
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

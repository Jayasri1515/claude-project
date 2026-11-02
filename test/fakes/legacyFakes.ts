/**
 * LEGACY fakes for the pre-approval two-method weather port, the optional-signal geocoding port and the
 * permission-state location port (impl-plan T-13). They stay only while the old services, controller and adapters use
 * those ports, and are deleted with them (T-20, T-21, T-26, T-27, T-30..T-32). The approved-port fakes are
 * `FakeWeatherProvider`, `FakeGeocodingProvider` and `FakeLocationService`.
 */
import type { CurrentWeather, ForecastDay, Location } from '../../src/core/domain';
import { positionUnavailable } from '../../src/core/errors';
import type { AppError } from '../../src/core/errors';
import { ABORTED } from '../../src/core/ports';
import type {
  LegacyGeocodingProvider,
  LegacyLocationService,
  LegacyWeatherProvider,
  PermissionState,
  PositionResult,
} from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import type { Result } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

type CurrentResult = Result<CurrentWeather, AppError>;
type ForecastResult = Result<ForecastDay[], AppError>;

/**
 * Controllable LegacyWeatherProvider. Defaults: empty current weather and an empty
 * forecast (every field missing). Held calls are not settled by an abort; the
 * test can inspect `call.aborted` and decide.
 */
export class LegacyFakeWeatherProvider implements LegacyWeatherProvider {
  readonly currentScript = new ScriptedMethod<[Location], CurrentResult>(ok({}));
  readonly forecastScript = new ScriptedMethod<[Location, number, boolean], ForecastResult>(ok([]));

  getCurrent(loc: Location, signal: AbortSignal): Promise<CurrentResult> {
    return this.currentScript.invoke([loc], signal);
  }

  getForecast(loc: Location, days: number, includeToday: boolean, signal: AbortSignal): Promise<ForecastResult> {
    return this.forecastScript.invoke([loc, days, includeToday], signal);
  }
}

type SearchResult = Result<Location[], AppError>;
type ReverseResult = Result<Location, AppError>;

export interface LegacyFakeGeocodingOptions {
  /** Provide the optional `reverse` method. Default false. */
  readonly withReverse?: boolean;
}

/** Controllable LegacyGeocodingProvider. Default: search finds nothing. */
export class LegacyFakeGeocodingProvider implements LegacyGeocodingProvider {
  readonly searchScript = new ScriptedMethod<[string, number], SearchResult>(ok([]));
  readonly reverseScript: ScriptedMethod<[number, number], ReverseResult> | undefined;
  reverse?: (lat: number, lon: number, signal?: AbortSignal) => Promise<ReverseResult>;

  constructor(options: LegacyFakeGeocodingOptions = {}) {
    if (options.withReverse === true) {
      const script = new ScriptedMethod<[number, number], ReverseResult>(
        (): ReverseResult => ({ ok: false, error: { kind: 'not_found', messageKey: 'error.notFound' } }),
      );
      this.reverseScript = script;
      this.reverse = (lat, lon, signal) => script.invoke([lat, lon], signal);
    }
  }

  search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult> {
    return this.searchScript.invoke([query, limit], signal);
  }
}

/**
 * Controllable LegacyLocationService. A held getCurrentPosition call settles with
 * ABORTED when its signal aborts, as the port contract requires.
 */
export class LegacyFakeLocationService implements LegacyLocationService {
  permission: PermissionState;
  permissionCalls = 0;
  readonly positionScript = new ScriptedMethod<[], PositionResult>(err(positionUnavailable()), () => ABORTED);
  /**
   * Answers `whenPermissionGranted`. Default: false at once (the change cannot be watched). `hold()` it and
   * `resolveNext(true)` to play a prompt the user answers with "Allow". A held call settles false when its signal aborts.
   */
  readonly grantScript = new ScriptedMethod<[], boolean>(false, () => false);

  constructor(permission: PermissionState = 'prompt') {
    this.permission = permission;
  }

  getPermissionState(): Promise<PermissionState> {
    this.permissionCalls += 1;
    return Promise.resolve(this.permission);
  }

  getCurrentPosition(signal: AbortSignal): Promise<PositionResult> {
    return this.positionScript.invoke([], signal);
  }

  whenPermissionGranted(signal: AbortSignal): Promise<boolean> {
    return this.grantScript.invoke([], signal);
  }
}

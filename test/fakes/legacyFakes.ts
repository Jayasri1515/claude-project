/**
 * LEGACY fakes for the pre-approval two-method weather port, the optional-signal geocoding port and the
 * permission-state location port (impl-plan T-13). They stay only while the old services, controller and adapters use
 * those ports, and are deleted with them (T-20, T-21, T-26, T-27, T-30..T-32). The approved-port fakes are
 * `FakeWeatherProvider`, `FakeGeocodingProvider` and `FakeLocationService`.
 */
import type { Coordinates, Current, Day, Location, WeatherResult } from '../../src/core/domain';
import { aborted, positionUnavailable } from '../../src/core/errors';
import type { AppError } from '../../src/core/errors';
import { ABORTED } from '../../src/core/ports';
import type {
  LegacyGeocodingProvider,
  LegacyLocationService,
  PermissionState,
  PositionResult,
  WeatherProvider,
} from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import type { Result } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

type CurrentResult = Result<Current, AppError>;
type ForecastResult = Result<Day[], AppError>;

/**
 * Controllable approved WeatherProvider (`get`) that keeps the two-script API of the old fake. Each `get` call makes
 * ONE call on `currentScript` and ONE on `forecastScript` (same coordinates, same signal) and answers when both have
 * answered, so the sections arrive together (architecture 3.1) and either script can hold, fail or script its own
 * section result. Defaults: empty current weather and an empty forecast (every field missing).
 *
 * - A section script answering `err(...)` becomes that section's error inside the `WeatherResult`.
 * - A section script answering `err(aborted())` makes the whole call `err(aborted())`.
 * - A section script that rejects (`failWith`) makes the whole call reject, like a provider that breaks its contract;
 *   the service turns that into SERVICE_UNAVAILABLE on both sections.
 * - Held calls are not settled by an abort; the test can inspect `call.aborted` and decide.
 *
 * TEMPORARY BRIDGE (migration batch 2): the name and the two scripts are kept so the existing tests keep working. A
 * later batch can fold this into `FakeWeatherProvider` (`getScript`) and delete the class.
 */
export class LegacyFakeWeatherProvider implements WeatherProvider {
  readonly currentScript = new ScriptedMethod<[Coordinates], CurrentResult>(ok({}));
  readonly forecastScript = new ScriptedMethod<[Coordinates], ForecastResult>(ok([]));
  /** Time zone reported with every answer (the real adapter reads it from the response). */
  timeZone: string | undefined;

  async get(coords: Coordinates, signal: AbortSignal): Promise<Result<WeatherResult, AppError>> {
    const [current, forecast] = await Promise.all([
      this.currentScript.invoke([coords], signal),
      this.forecastScript.invoke([coords], signal),
    ]);
    if ((!current.ok && current.error.kind === 'aborted') || (!forecast.ok && forecast.error.kind === 'aborted')) {
      return err(aborted());
    }
    return ok({ ...(this.timeZone !== undefined ? { timeZone: this.timeZone } : {}), current, forecast });
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

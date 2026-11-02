/**
 * Weather Service (C6, architecture 4.6 and Flow C; impl-plan T-20).
 *
 * Loads current weather and forecast for a Location with ONE `WeatherProvider.get` call. The two sections arrive
 * together but succeed or fail independently: a section error inside the result stays on that section only, and a
 * whole-call failure (transport, timeout, rate limit) puts the same error on both. A per-section `updatedAt` is taken
 * from the Clock on each successful section, previous data and time are kept on failure, `weatherTimeoutMs` applies to
 * the call, and nothing is retried automatically.
 *
 * Single-flight is the controller's job (`AppController.activeLoad`, architecture 3.7): it aborts the superseded
 * load before a new one starts and ignores a refresh while one is running, so the service keeps no per-key map.
 *
 * Staleness: the caller (App Controller) owns the selection token. When the selection changes it aborts the
 * AbortSignal it passed in. The service then aborts the provider call, discards its result and returns ABORTED with
 * no further `onUpdate` calls. (ABORTED is the legacy form; a later batch replaces it by an AppError of kind
 * 'aborted'.)
 *
 * The service produces no user text: errors are `AppError` values, and the view's `label` is the place name only.
 */
import type { Aborted } from './aborted';
import { ABORTED } from './aborted';
import type { Config } from './config';
import type { Coordinates, Current, Day, Location, Section, WeatherResult, WeatherView } from './domain';
import { serviceUnavailable, timeoutError } from './errors';
import type { AppError } from './errors';
import { padForecast, truncateForecast } from './forecast';
import type { ForecastSlot } from './forecast';
import { placeLabel } from './placeLabel';
import type { Clock, WeatherProvider } from './ports';
import { err, ok } from './result';
import type { Ok, Result } from './result';

export type WeatherLoadResult = Ok<WeatherView> | Aborted;

export interface WeatherRequestContext {
  /** Aborted by the caller when the selection changes (superseded work). */
  readonly signal: AbortSignal;
  /**
   * Called with the working view when loading starts and when the answer arrives, so the UI can show the loading
   * state. Never called after the signal aborts.
   */
  readonly onUpdate?: (view: WeatherView) => void;
}

export type WeatherServiceConfig = Pick<Config, 'weatherTimeoutMs' | 'forecastDays' | 'forecastIncludesToday'>;

export interface WeatherServiceDeps {
  readonly provider: WeatherProvider;
  readonly clock: Clock;
  readonly config: WeatherServiceConfig;
}

type GuardedResult<T> = Result<T, AppError> | Aborted;

/** Section without keys whose value is undefined, so equality checks stay strict. */
function makeSection<T>(
  status: Section<T>['status'],
  parts: { data?: T | undefined; error?: AppError | undefined; updatedAt?: Date | undefined } = {},
): Section<T> {
  return {
    status,
    ...(parts.data !== undefined ? { data: parts.data } : {}),
    ...(parts.error !== undefined ? { error: parts.error } : {}),
    ...(parts.updatedAt !== undefined ? { updatedAt: parts.updatedAt } : {}),
  };
}

function viewOf(
  location: Location,
  timeZone: string | undefined,
  current: Section<Current>,
  forecast: Section<Day[]>,
): WeatherView {
  return {
    key: location.key,
    label: placeLabel(location),
    ...(timeZone !== undefined ? { timeZone } : {}),
    current,
    forecast,
  };
}

export class WeatherService {
  private readonly provider: WeatherProvider;
  private readonly clock: Clock;
  private readonly config: WeatherServiceConfig;

  constructor(deps: WeatherServiceDeps) {
    this.provider = deps.provider;
    this.clock = deps.clock;
    this.config = deps.config;
  }

  /** Load weather for a newly selected location (no previous data is kept). */
  load(location: Location, context: WeatherRequestContext): Promise<WeatherLoadResult> {
    return this.execute(location, undefined, context);
  }

  /**
   * Refresh `location`, which `previous` shows. A section that fails keeps its previous data and previous
   * `updatedAt` (FR-029).
   */
  refresh(location: Location, previous: WeatherView, context: WeatherRequestContext): Promise<WeatherLoadResult> {
    return this.execute(location, previous, context);
  }

  /** Forecast rows for display: exactly `forecastDays` slots, padded with 'unavailable'. */
  forecastSlots(view: WeatherView): ForecastSlot[] {
    return padForecast(view.forecast.data ?? [], this.config.forecastDays);
  }

  private async execute(
    location: Location,
    previous: WeatherView | undefined,
    context: WeatherRequestContext,
  ): Promise<WeatherLoadResult> {
    const { signal } = context;
    if (signal.aborted) return ABORTED;

    const kept = previous !== undefined && previous.key === location.key ? previous : undefined;
    const coords: Coordinates = { lat: location.latitude, lon: location.longitude };

    const loading = viewOf(
      location,
      kept?.timeZone,
      makeSection('loading', { data: kept?.current.data, updatedAt: kept?.current.updatedAt }),
      makeSection('loading', { data: kept?.forecast.data, updatedAt: kept?.forecast.updatedAt }),
    );
    context.onUpdate?.(loading);

    const outcome = await this.guarded((s) => this.provider.get(coords, s), signal);
    if (signal.aborted || (!outcome.ok && 'aborted' in outcome)) return ABORTED;

    // One clock reading for the whole answer: when both sections succeed they share one time.
    const now = this.clock.now();
    const settled = outcome.ok ? this.applyResult(loading, outcome.value, now) : this.applyFailure(loading, outcome.error);
    context.onUpdate?.(settled);
    return ok(settled);
  }

  /** Both sections after a whole-call failure: error on each, previous data and time kept (FR-029). */
  private applyFailure(loading: WeatherView, error: AppError): WeatherView {
    return {
      ...loading,
      current: makeSection('error', { error, data: loading.current.data, updatedAt: loading.current.updatedAt }),
      forecast: makeSection('error', { error, data: loading.forecast.data, updatedAt: loading.forecast.updatedAt }),
    };
  }

  /** Sections after an answer: each is ready or error on its own. A failed section keeps prior data and time. */
  private applyResult(loading: WeatherView, result: WeatherResult, now: Date): WeatherView {
    const current: Section<Current> = result.current.ok
      ? makeSection('ready', { data: result.current.value, updatedAt: now })
      : makeSection('error', {
          error: result.current.error,
          data: loading.current.data,
          updatedAt: loading.current.updatedAt,
        });
    const forecast: Section<Day[]> = result.forecast.ok
      ? makeSection('ready', { data: truncateForecast(result.forecast.value, this.config.forecastDays), updatedAt: now })
      : makeSection('error', {
          error: result.forecast.error,
          data: loading.forecast.data,
          updatedAt: loading.forecast.updatedAt,
        });
    return { ...loading, ...(result.timeZone !== undefined ? { timeZone: result.timeZone } : {}), current, forecast };
  }

  /**
   * Run the provider call under the weather timeout and the caller's signal.
   * The race also guarantees a settle if the provider ignores the signal. A throwing or rejecting provider becomes
   * SERVICE_UNAVAILABLE.
   */
  private async guarded<T>(
    call: (signal: AbortSignal) => Promise<Result<T, AppError>>,
    external: AbortSignal,
  ): Promise<GuardedResult<T>> {
    if (external.aborted) return ABORTED;
    const own = new AbortController();
    const onExternalAbort = (): void => own.abort();
    external.addEventListener('abort', onExternalAbort, { once: true });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<GuardedResult<T>>((resolve) => {
      timer = setTimeout(() => {
        resolve(err(timeoutError()));
        own.abort();
      }, this.config.weatherTimeoutMs);
      own.signal.addEventListener('abort', () => resolve(ABORTED), { once: true });
    });
    // A provider result of kind `aborted` is the app's own cancellation (DR-09): it becomes the discard outcome, so it
    // can never be stored in a section or shown.
    const run: Promise<GuardedResult<T>> = (async () => call(own.signal))()
      .then((result): GuardedResult<T> => (!result.ok && result.error.kind === 'aborted' ? ABORTED : result))
      .catch(() => err(serviceUnavailable()));

    try {
      return await Promise.race([run, guard]);
    } finally {
      clearTimeout(timer);
      external.removeEventListener('abort', onExternalAbort);
    }
  }
}

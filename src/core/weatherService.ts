/**
 * Weather Service (C6, architecture 4.6 and Flow C).
 *
 * Loads current weather and forecast for a Location in parallel with
 * independent section status, records a per-section `updatedAt` from the Clock
 * on each successful fetch, keeps previous data on failure, allows at most one
 * in-flight request per (location, operation), applies `weatherTimeoutMs`, and
 * never retries automatically.
 *
 * Staleness: the caller (App Controller) owns the selection token. When the
 * selection changes it aborts the AbortSignal it passed in. The service then
 * aborts the provider calls, discards their results and returns ABORTED with no
 * further `onUpdate` calls.
 */
import type { Aborted } from './aborted';
import { ABORTED, isAbortedResult } from './aborted';
import type { Config } from './config';
import type { ForecastDay, Location, Section, WeatherSnapshot } from './domain';
import { serviceUnavailable, timeoutError } from './errors';
import type { AppError } from './errors';
import { padForecast, truncateForecast } from './forecast';
import type { ForecastSlot } from './forecast';
import type { Clock, WeatherProvider } from './ports';
import { err, ok } from './result';
import type { Ok, Result } from './result';

export type WeatherLoadResult = Ok<WeatherSnapshot> | Aborted;

export interface WeatherRequestContext {
  /** Aborted by the caller when the selection changes (superseded work). */
  readonly signal: AbortSignal;
  /**
   * Called with the working snapshot when loading starts and after each section
   * settles, so the UI can render sections as they resolve. Never called after
   * the signal aborts. If a request is joined by single-flight, only the first
   * caller's callback is used.
   */
  readonly onUpdate?: (snapshot: WeatherSnapshot) => void;
}

export type WeatherServiceConfig = Pick<Config, 'weatherTimeoutMs' | 'forecastDays' | 'forecastIncludesToday'>;

export interface WeatherServiceDeps {
  readonly provider: WeatherProvider;
  readonly clock: Clock;
  readonly config: WeatherServiceConfig;
}

type Operation = 'load' | 'refresh';
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

export class WeatherService {
  private readonly provider: WeatherProvider;
  private readonly clock: Clock;
  private readonly config: WeatherServiceConfig;
  private readonly inFlight = new Map<string, Promise<WeatherLoadResult>>();

  constructor(deps: WeatherServiceDeps) {
    this.provider = deps.provider;
    this.clock = deps.clock;
    this.config = deps.config;
  }

  /** Load weather for a newly selected location (no previous data is kept). */
  load(location: Location, context: WeatherRequestContext): Promise<WeatherLoadResult> {
    return this.start('load', location, undefined, context);
  }

  /**
   * Refresh the location of `previous`. A section that fails keeps its previous
   * data and previous `updatedAt` (FR-029).
   */
  refresh(previous: WeatherSnapshot, context: WeatherRequestContext): Promise<WeatherLoadResult> {
    return this.start('refresh', previous.location, previous, context);
  }

  /** Forecast rows for display: exactly `forecastDays` slots, padded with 'unavailable'. */
  forecastSlots(snapshot: WeatherSnapshot): ForecastSlot[] {
    return padForecast(snapshot.forecast.data ?? [], this.config.forecastDays);
  }

  private start(
    operation: Operation,
    location: Location,
    previous: WeatherSnapshot | undefined,
    context: WeatherRequestContext,
  ): Promise<WeatherLoadResult> {
    if (context.signal.aborted) return Promise.resolve(ABORTED);

    const key = `${operation}|${location.key}`;
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing; // single-flight (FR-028, AC-P-03)

    const promise: Promise<WeatherLoadResult> = this.execute(location, previous, context).finally(() => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    // A superseded request must not be joined by a later, legitimate one.
    context.signal.addEventListener(
      'abort',
      () => {
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
      },
      { once: true },
    );
    return promise;
  }

  private async execute(
    location: Location,
    previous: WeatherSnapshot | undefined,
    context: WeatherRequestContext,
  ): Promise<WeatherLoadResult> {
    const kept = previous !== undefined && previous.location.key === location.key ? previous : undefined;
    const { signal } = context;

    let snapshot: WeatherSnapshot = {
      location,
      current: makeSection('loading', { data: kept?.current.data, updatedAt: kept?.current.updatedAt }),
      forecast: makeSection('loading', { data: kept?.forecast.data, updatedAt: kept?.forecast.updatedAt }),
    };
    const emit = (): void => {
      if (!signal.aborted) context.onUpdate?.(snapshot);
    };
    emit();

    let currentSucceeded = false;
    let forecastSucceeded = false;

    const currentRun = this.guarded((s) => this.provider.getCurrent(location, s), signal).then((outcome) => {
      if (signal.aborted || isAbortedResult(outcome)) return;
      currentSucceeded = outcome.ok;
      snapshot = { ...snapshot, current: this.applyOutcome(snapshot.current, outcome) };
      emit();
    });

    const forecastRun = this.guarded(
      (s) => this.provider.getForecast(location, this.config.forecastDays, this.config.forecastIncludesToday, s),
      signal,
    ).then((outcome) => {
      if (signal.aborted || isAbortedResult(outcome)) return;
      forecastSucceeded = outcome.ok;
      const shaped: Result<ForecastDay[], AppError> = outcome.ok
        ? ok(truncateForecast(outcome.value, this.config.forecastDays))
        : outcome;
      snapshot = { ...snapshot, forecast: this.applyOutcome(snapshot.forecast, shaped) };
      emit();
    });

    await Promise.all([currentRun, forecastRun]);
    if (signal.aborted) return ABORTED;

    // After a fully successful run both sections share one time: the older of
    // the two, so freshness is never overstated (FR-027, FR-030).
    const a = snapshot.current.updatedAt;
    const b = snapshot.forecast.updatedAt;
    if (currentSucceeded && forecastSucceeded && a !== undefined && b !== undefined && a.getTime() !== b.getTime()) {
      const older = a.getTime() < b.getTime() ? a : b;
      snapshot = {
        ...snapshot,
        current: { ...snapshot.current, updatedAt: older },
        forecast: { ...snapshot.forecast, updatedAt: older },
      };
      emit();
    }
    return ok(snapshot);
  }

  /** Section state after a settled fetch. A failure keeps prior data and time. */
  private applyOutcome<T>(previous: Section<T>, outcome: Result<T, AppError>): Section<T> {
    if (outcome.ok) return makeSection('ready', { data: outcome.value, updatedAt: this.clock.now() });
    return makeSection('error', { error: outcome.error, data: previous.data, updatedAt: previous.updatedAt });
  }

  /**
   * Run one provider call under the weather timeout and the caller's signal.
   * Each call has its own AbortController so a timeout on one section does not
   * abort the other. The race also guarantees a settle if the provider ignores
   * the signal. A throwing or rejecting provider becomes SERVICE_UNAVAILABLE.
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
    const run: Promise<GuardedResult<T>> = (async () => call(own.signal))().catch(() => err(serviceUnavailable()));

    try {
      return await Promise.race([run, guard]);
    } finally {
      clearTimeout(timer);
      external.removeEventListener('abort', onExternalAbort);
    }
  }
}

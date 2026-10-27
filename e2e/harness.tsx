/**
 * Browser test harness (test support only). It composes the app in LIVE mode with
 * the invented demo providers injected for data, but with the REAL browser adapters
 * (BrowserLocationService, LocalStorageStore) left in place, so the Geolocation and
 * localStorage paths run against a real browser. Query: ?start=1 calls controller.start().
 *
 * The injected providers are wrapped so a test can observe and control them:
 * - window.__harness.started resolves when controller.start() has finished;
 * - window.__harness.calls counts provider calls ({ search, current, forecast }), so a test can prove that
 *   an action (for example a refresh) really reached the data layer;
 * - window.__harness.hold() makes every provider call wait until window.__harness.release(), so a test
 *   can look at the loading and busy states without racing the providers' short built-in delay.
 * These hooks only observe or delay; they do not change what the providers return.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserLocationService } from '../src/adapters/web/geolocation';
import { LocalStorageStore } from '../src/adapters/web/localStorageStore';
import { compose } from '../src/composition';
import type { AppError } from '../src/core/errors';
import type { CurrentWeather, ForecastDay, Location } from '../src/core/domain';
import type { GeocodingProvider, WeatherProvider } from '../src/core/ports';
import type { Result } from '../src/core/result';
import { DemoGeocodingProvider, DemoWeatherProvider } from '../src/dev/demoProviders';
import '../src/styles.css';
import { App } from '../src/ui/App';

const calls = { search: 0, current: 0, forecast: 0 };
let held = false;
let waiters: Array<() => void> = [];

/** Resolves at once, or after release() while held. */
function gate(): Promise<void> {
  return held ? new Promise<void>((resolve) => waiters.push(resolve)) : Promise.resolve();
}

class ObservedGeocoding implements GeocodingProvider {
  private readonly inner = new DemoGeocodingProvider();
  async search(query: string, limit: number, signal?: AbortSignal): Promise<Result<Location[], AppError>> {
    calls.search += 1;
    await gate();
    return this.inner.search(query, limit, signal);
  }
}

class ObservedWeather implements WeatherProvider {
  private readonly inner: DemoWeatherProvider;
  constructor(clock: { now(): Date }) {
    this.inner = new DemoWeatherProvider(clock);
  }
  async getCurrent(loc: Location, signal: AbortSignal): Promise<Result<CurrentWeather, AppError>> {
    calls.current += 1;
    await gate();
    return this.inner.getCurrent(loc, signal);
  }
  async getForecast(loc: Location, days: number, includeToday: boolean, signal: AbortSignal): Promise<Result<ForecastDay[], AppError>> {
    calls.forecast += 1;
    await gate();
    return this.inner.getForecast(loc, days, includeToday, signal);
  }
}

const clock = { now: () => new Date() };
const c = compose({ geocoding: new ObservedGeocoding(), weather: new ObservedWeather(clock), clock });
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App store={c.store} controller={c.controller} config={c.config} demo={c.demo} />
    </StrictMode>,
  );
}
const startRequested = new URLSearchParams(window.location.search).get('start') === '1';
// Resolves when controller.start() has finished (immediately when ?start=1 is not given), so a test can wait for a condition.
const started: Promise<void> = startRequested ? c.controller.start() : Promise.resolve();
Object.assign(window, {
  __harness: {
    mode: c.mode,
    BrowserLocationService,
    LocalStorageStore,
    calls,
    started,
    hold: () => {
      held = true;
    },
    release: () => {
      held = false;
      const pending = waiters;
      waiters = [];
      for (const resolve of pending) resolve();
    },
  },
});

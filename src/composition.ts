/**
 * Composition root (TASK-036). Wires the core services and the real browser
 * adapters (localStorage, Geolocation) around two weather-data ports. Everything
 * is injectable so tests can substitute fakes.
 *
 * Which data source is used (the mode):
 * - "live": both a GeocodingProvider and a WeatherProvider were injected.
 *   `composeLive` (TASK-037) is what a normal build uses: it injects the real
 *   Open-Meteo adapters (src/adapters/openMeteo). Tests inject fakes instead.
 * - "demo": built by composeDemo (src/dev/demoComposition.ts), which main.tsx
 *   loads only when demo is explicitly requested (Vite mode "demo" or
 *   VITE_USE_DEMO=true; the single place that condition is written is main.tsx, because
 *   Vite can only drop the demo code from release builds if the reads are literal there)
 *   and only in a demo build. The demo providers return invented data, so they are
 *   never the silent default and are NOT part of release builds. In demo mode
 *   saved data goes under a separate key prefix, the device position is not
 *   read, and forecast dates follow the Clock.
 * - "unconfigured": `compose()` was called with no providers (only tests and
 *   misuse do this: `composeLive` always supplies them). The UI then shows a
 *   "not set up" notice and the placeholder ports below are never used to
 *   fabricate data. A plain build is NOT unconfigured any more (TASK-037).
 */
import { BrowserLocationService } from './adapters/web/geolocation';
import { OpenMeteoGeocodingProvider } from './adapters/openMeteo/geocoding';
import type { FetchLike } from './adapters/openMeteo/http';
import { OpenMeteoWeatherProvider } from './adapters/openMeteo/weather';
import { LocalStorageStore } from './adapters/web/localStorageStore';
import { AppController } from './core/appController';
import { createConfig } from './core/config';
import type { Config } from './core/config';
import type { AppError } from './core/errors';
import { serviceUnavailable } from './core/errors';
import { FavoritesService } from './core/favorites/favoritesService';
import { LocationFlow } from './core/locationFlow';
import { message } from './core/messages';
import type { Clock, GeocodingProvider, KeyValueStore, LocationService, WeatherProvider } from './core/ports';
import { err } from './core/result';
import type { Result } from './core/result';
import { SearchService } from './core/search';
import { SettingsService } from './core/settings';
import { ViewStateStore } from './core/store';
import { WeatherService } from './core/weatherService';

export type AppMode = 'live' | 'demo' | 'unconfigured';

export interface CompositionOptions {
  readonly config?: Config;
  readonly keyValueStore?: KeyValueStore;
  readonly locationService?: LocationService;
  readonly geocoding?: GeocodingProvider;
  readonly weather?: WeatherProvider;
  readonly clock?: Clock;
  /**
   * Marks the injected ports as the invented-data demo ports. Set only by composeDemo
   * (src/dev/demoComposition.ts); this module never imports the demo code, so release
   * builds can leave it out. Has no effect unless both providers are injected.
   */
  readonly demo?: boolean;
}

export interface Composition {
  readonly store: ViewStateStore;
  readonly controller: AppController;
  readonly config: Config;
  readonly mode: AppMode;
  /** True in demo mode (the UI then shows a demo notice). */
  readonly demo: boolean;
  /** True when no data source is configured (the UI then shows a "not set up" notice). */
  readonly unconfigured: boolean;
}

const systemClock: Clock = { now: () => new Date() };

/**
 * Placeholder ports for the unconfigured mode. They never produce data: the UI
 * does not offer search or weather in that mode, and a call (which would be a
 * bug) fails with the normal "service unavailable" error.
 */
class UnconfiguredGeocoding implements GeocodingProvider {
  search(): Promise<Result<never, AppError>> {
    return Promise.resolve(err(serviceUnavailable()));
  }
}

class UnconfiguredWeather implements WeatherProvider {
  getCurrent(): Promise<Result<never, AppError>> {
    return Promise.resolve(err(serviceUnavailable()));
  }

  getForecast(): Promise<Result<never, AppError>> {
    return Promise.resolve(err(serviceUnavailable()));
  }
}

export function compose(options: CompositionOptions = {}): Composition {
  const config = options.config ?? createConfig();
  const clock = options.clock ?? systemClock;
  const injected = options.geocoding !== undefined && options.weather !== undefined;
  const mode: AppMode = injected ? (options.demo === true ? 'demo' : 'live') : 'unconfigured';

  const keyValueStore = options.keyValueStore ?? new LocalStorageStore();
  const locationService: LocationService = options.locationService ?? new BrowserLocationService();
  const geocoding: GeocodingProvider = options.geocoding ?? new UnconfiguredGeocoding();
  const weatherProvider: WeatherProvider = options.weather ?? new UnconfiguredWeather();

  const store = new ViewStateStore();
  const controller = new AppController({
    search: new SearchService({ geocoding, config }),
    weather: new WeatherService({ provider: weatherProvider, clock, config }),
    locationFlow: new LocationFlow({ location: locationService, geocoding, config }),
    favorites: new FavoritesService({ store: keyValueStore, config }),
    settings: new SettingsService({ store: keyValueStore, config }),
    store,
  });
  return { store, controller, config, mode, demo: mode === 'demo', unconfigured: mode === 'unconfigured' };
}

export interface LiveCompositionOptions extends CompositionOptions {
  /** Replaces the global `fetch` used by the Open-Meteo adapters. For tests; the app never sets it. */
  readonly fetch?: FetchLike;
}

/**
 * The credit that Open-Meteo's licence (CC BY 4.0) and its geocoding documentation ask for when their data is
 * shown (TASK-025). The words come from the message table. A Config that already has a non-empty
 * `attributionText` keeps it; an empty one gets this text, so real Open-Meteo data is never composed without a
 * credit unless a caller deliberately supplies other text.
 */
export function liveAttributionText(): string {
  return message('ui.attribution.text', {
    weather: message('ui.attribution.weather'),
    geonames: message('ui.attribution.geonames'),
  });
}

function withLiveAttribution(config: Config): Config {
  return config.attributionText.trim() !== '' ? config : createConfig({ ...config, attributionText: liveAttributionText() });
}

/**
 * The composition a normal build uses (TASK-037): the real Open-Meteo adapters for search and weather,
 * the real localStorage and Geolocation adapters, and the system clock.
 *
 * - Both adapters time out after `Config.weatherTimeoutMs`. Geocoding reuses that value because the
 *   architecture defines no separate geocoding timeout (Config has none; see the 5.1 amendment).
 * - There is no retry: a failure is shown with a user-initiated Retry (ODD-4).
 * - No reverse geocoding is wired. Open-Meteo has no such endpoint (user answer A4 = No), so the geocoding
 *   adapter has no `reverse` method; a device location is shown as "Current location" and cannot be
 *   saved as a favorite.
 * - Providers passed in `options` win, which keeps the composition testable.
 */
export function composeLive(options: LiveCompositionOptions = {}): Composition {
  const config = withLiveAttribution(options.config ?? createConfig());
  const { fetch, ...rest } = options;
  const adapterOptions = { timeoutMs: config.weatherTimeoutMs, ...(fetch !== undefined ? { fetch } : {}) };
  return compose({
    ...rest,
    config,
    geocoding: options.geocoding ?? new OpenMeteoGeocodingProvider(adapterOptions),
    weather: options.weather ?? new OpenMeteoWeatherProvider(adapterOptions),
  });
}

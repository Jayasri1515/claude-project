/**
 * DEMO-ONLY composition (TASK-036). The only place that wires the invented-data
 * demo providers, the demo-prefixed store and the demo location stand-in into the
 * app. src/main.tsx loads this module with a dynamic import that is guarded by a
 * build-time constant, so a release build (a plain `npm run build`) drops this
 * file and everything it imports from dist/. `npm run build:demo` and
 * `npm run dev:demo` keep it. `npm run scan:dist` fails if demo markers are found
 * in a release bundle.
 */
import { LocalStorageStore } from '../adapters/web/localStorageStore';
import { compose } from '../composition';
import type { Composition, CompositionOptions } from '../composition';
import type { Clock } from '../core/ports';
import { DemoGeocodingProvider, DemoLocationService, DemoWeatherProvider } from './demoProviders';
import { PrefixedKeyValueStore } from './prefixedStore';

/** Key prefix that keeps demo data apart from real saved data. */
export const DEMO_STORAGE_PREFIX = 'demo:';

const systemClock: Clock = { now: () => new Date() };

/**
 * Composes the app in demo mode: invented places and weather, saved data under
 * DEMO_STORAGE_PREFIX, no device position read, and forecast dates that follow
 * the Clock. If both real providers are injected the result is a normal "live"
 * composition (demo is ignored), as before.
 */
export function composeDemo(options: CompositionOptions = {}): Composition {
  if (options.geocoding !== undefined && options.weather !== undefined) return compose(options);
  const clock = options.clock ?? systemClock;
  return compose({
    ...options,
    clock,
    keyValueStore: new PrefixedKeyValueStore(options.keyValueStore ?? new LocalStorageStore(), DEMO_STORAGE_PREFIX),
    locationService: options.locationService ?? new DemoLocationService(),
    geocoding: options.geocoding ?? new DemoGeocodingProvider(),
    weather: options.weather ?? new DemoWeatherProvider(clock),
    demo: true,
  });
}

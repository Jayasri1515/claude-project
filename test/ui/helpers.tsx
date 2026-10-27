import { cleanup, render } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { compose } from '../../src/composition';
import { createConfig } from '../../src/core/config';
import type { Config } from '../../src/core/config';
import type { Location } from '../../src/core/domain';
import { ok } from '../../src/core/result';
import { createInitialState, ViewStateStore } from '../../src/core/store';
import type { ViewState } from '../../src/core/store';
import { App } from '../../src/ui/App';
import type { UiController } from '../../src/ui/context';
import { sampleForecast, sampleLocation } from '../fixtures/domain';
import {
  FakeClock,
  FakeGeocodingProvider,
  FakeLocationService,
  FakeWeatherProvider,
  InMemoryKeyValueStore,
} from '../fakes';

// Registered at import time so every UI test file unmounts its trees.
afterEach(() => {
  cleanup();
});

export const city = (n: number, extra: Partial<Location> = {}): Location => ({
  ...sampleLocation,
  key: `test:${n}`,
  placeId: String(n),
  name: `City ${n}`,
  latitude: n,
  longitude: n * 2,
  ...extra,
});

/** True for a natively disabled control or one marked aria-disabled (busy controls keep focus). */
export function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled === true || element.getAttribute('aria-disabled') === 'true';
}

export type FakeController = { [K in keyof UiController]: Mock<UiController[K]> };

/** A controller that only records the intents it receives. */
export function makeFakeController(): FakeController {
  const done = (): Promise<void> => Promise.resolve();
  return {
    searchCity: vi.fn(done),
    chooseCandidate: vi.fn(done),
    useMyLocation: vi.fn(done),
    refresh: vi.fn(done),
    selectFavorite: vi.fn(done),
    addFavorite: vi.fn(done),
    removeFavorite: vi.fn(done),
    setTemperatureUnit: vi.fn(done),
  };
}

/** Render the app over a store with the given state and a recording controller. */
export function renderWithFakeController(initial: Partial<ViewState> = {}, config: Config = createConfig()) {
  const store = new ViewStateStore(createInitialState(initial));
  const controller = makeFakeController();
  const view = render(<App store={store} controller={controller} config={config} />);
  return { store, controller, config, ...view };
}

export interface StackOptions {
  readonly permission?: 'granted' | 'prompt' | 'denied' | 'unsupported';
  readonly withReverse?: boolean;
  readonly kv?: InMemoryKeyValueStore;
  readonly config?: Config;
}

/** The real core and controller over the fakes of TASK-012. */
export function createStack(options: StackOptions = {}) {
  const kv = options.kv ?? new InMemoryKeyValueStore();
  const geocoding = new FakeGeocodingProvider({ withReverse: options.withReverse ?? false });
  const weather = new FakeWeatherProvider();
  const location = new FakeLocationService(options.permission ?? 'prompt');
  const clock = new FakeClock();
  weather.currentScript.respondWith(ok({ temperatureC: 21.5, humidityPct: 60, condition: 'PARTLY_CLOUDY' }));
  weather.forecastScript.respondWith(ok(sampleForecast));
  const composition = compose({
    config: options.config ?? createConfig(),
    keyValueStore: kv,
    locationService: location,
    geocoding,
    weather,
    clock,
  });
  return { kv, geocoding, weather, location, clock, ...composition };
}

export type Stack = ReturnType<typeof createStack>;

export function renderStack(options: StackOptions = {}) {
  const stack = createStack(options);
  const view = render(
    <App
      store={stack.store}
      controller={stack.controller}
      config={stack.config}
      demo={stack.demo}
      unconfigured={stack.unconfigured}
    />,
  );
  return { ...stack, ...view };
}

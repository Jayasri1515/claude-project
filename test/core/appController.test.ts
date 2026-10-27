import { describe, expect, it } from 'vitest';
import { AppController } from '../../src/core/appController';
import { createConfig } from '../../src/core/config';
import type { Location } from '../../src/core/domain';
import { FAVORITES_STORAGE_KEY, FavoritesService } from '../../src/core/favorites/favoritesService';
import { LocationFlow } from '../../src/core/locationFlow';
import { err, ok } from '../../src/core/result';
import { SearchService } from '../../src/core/search';
import { SettingsService } from '../../src/core/settings';
import { favoriteAvailability, ViewStateStore } from '../../src/core/store';
import { WeatherService } from '../../src/core/weatherService';
import { serviceUnavailable } from '../../src/core/errors';
import { sampleLocation } from '../fixtures/domain';
import {
  FakeClock,
  FakeGeocodingProvider,
  FakeLocationService,
  FakeWeatherProvider,
  InMemoryKeyValueStore,
} from '../fakes';

const city = (n: number, extra: Partial<Location> = {}): Location => ({
  ...sampleLocation,
  key: `test:${n}`,
  placeId: String(n),
  name: `City ${n}`,
  latitude: n,
  longitude: n * 2,
  ...extra,
});
const A = city(1);
const B = city(2);

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function setup(
  options: { permission?: 'granted' | 'prompt' | 'denied' | 'unsupported'; withReverse?: boolean; store?: InMemoryKeyValueStore } = {},
) {
  const kv = options.store ?? new InMemoryKeyValueStore();
  const config = createConfig();
  const geocoding = new FakeGeocodingProvider({ withReverse: options.withReverse ?? false });
  const weatherProvider = new FakeWeatherProvider();
  const location = new FakeLocationService(options.permission ?? 'prompt');
  const clock = new FakeClock();
  const store = new ViewStateStore();
  const favorites = new FavoritesService({ store: kv, config });
  const settings = new SettingsService({ store: kv, config });
  const controller = new AppController({
    search: new SearchService({ geocoding, config }),
    weather: new WeatherService({ provider: weatherProvider, clock, config }),
    locationFlow: new LocationFlow({ location, geocoding, config }),
    favorites,
    settings,
    store,
  });
  // Weather answers carry the city so tests can tell whose data is on screen.
  weatherProvider.currentScript.respondWith((loc) => ok({ temperatureC: loc.latitude }));
  return { kv, geocoding, weatherProvider, location, store, controller, favorites, settings };
}

const coords = ok({ lat: 33.3, lon: 44.4 });

describe('launch behavior (LaunchPolicy)', () => {
  it('permission granted: auto-detects and shows weather', async () => {
    const t = setup({ permission: 'granted' });
    t.location.positionScript.respondWith(coords);
    await t.controller.start();
    expect(t.location.positionScript.callCount).toBe(1);
    expect(t.store.getState().selectedLocation?.source).toBe('device');
    expect(t.store.getState().snapshot?.current.status).toBe('ready');
    expect(t.weatherProvider.currentScript.callCount).toBe(1);
  });

  it.each(['prompt', 'denied', 'unsupported'] as const)(
    'permission %s: never calls getCurrentPosition and loads no weather',
    async (permission) => {
      const t = setup({ permission });
      await t.controller.start();
      expect(t.location.positionScript.callCount).toBe(0);
      expect(t.weatherProvider.currentScript.callCount).toBe(0);
      expect(t.store.getState().selectedLocation).toBeUndefined();
      expect(t.store.getState().locationFlow).toEqual({ status: 'idle' });
    },
  );

  it('loads favorites and the saved unit into the store', async () => {
    const kv = new InMemoryKeyValueStore();
    const first = setup({ store: kv });
    await first.controller.chooseCandidate(A);
    await first.controller.addFavorite();
    await first.controller.setTemperatureUnit('F');
    const second = setup({ store: kv });
    await second.controller.start();
    expect(second.store.getState().favorites.map((f) => f.key)).toEqual([A.key]);
    expect(second.store.getState().temperatureUnit).toBe('F');
  });

  it('a user search during the launch permission read wins over auto-detect', async () => {
    const t = setup({ permission: 'granted' });
    t.location.positionScript.respondWith(coords);
    t.geocoding.searchScript.respondWith(ok([A]));
    const launching = t.controller.start();
    const searching = t.controller.searchCity('city one');
    await Promise.all([launching, searching]);
    expect(t.location.positionScript.callCount).toBe(0);
    expect(t.store.getState().selectedLocation?.key).toBe(A.key);
  });
});

describe('"Use my location"', () => {
  it('prompt state: the user action is what calls getCurrentPosition', async () => {
    const t = setup({ permission: 'prompt' });
    t.location.positionScript.respondWith(coords);
    await t.controller.start();
    expect(t.location.positionScript.callCount).toBe(0);
    await t.controller.useMyLocation();
    expect(t.location.positionScript.callCount).toBe(1);
    expect(t.store.getState().selectedLocation?.name).toBe('Current location');
  });

  it('re-reads the permission on every use', async () => {
    const t = setup({ permission: 'prompt' });
    t.location.positionScript.respondWith(coords);
    await t.controller.start();
    const afterStart = t.location.permissionCalls;
    await t.controller.useMyLocation();
    t.location.permission = 'denied';
    await t.controller.useMyLocation();
    expect(t.location.permissionCalls - afterStart).toBe(2);
    expect(t.store.getState().locationFlow).toMatchObject({ status: 'error', error: { code: 'LOCATION_DENIED' } });
  });

  it('a failure keeps city search usable and keeps the displayed weather', async () => {
    const t = setup({ permission: 'granted' });
    await t.controller.chooseCandidate(A);
    t.location.positionScript.respondWith(err({ code: 'TIMEOUT', messageKey: 'error.timeout' }));
    await t.controller.useMyLocation();
    expect(t.store.getState().locationFlow).toMatchObject({ status: 'error', error: { code: 'TIMEOUT' } });
    expect(t.store.getState().snapshot?.location.key).toBe(A.key);
    t.geocoding.searchScript.respondWith(ok([B]));
    await t.controller.searchCity('two');
    expect(t.store.getState().selectedLocation?.key).toBe(B.key);
  });
});

describe('stale results are discarded (selection token)', () => {
  it('a slow device-location result after a city search is discarded', async () => {
    const t = setup({ permission: 'granted' });
    t.location.positionScript.hold();
    const locating = t.controller.useMyLocation();
    await flush();
    t.geocoding.searchScript.respondWith(ok([A]));
    await t.controller.searchCity('city one');
    expect(t.location.positionScript.calls[0]?.aborted).toBe(true);
    t.location.positionScript.pending[0]?.resolve(coords);
    await locating;
    const state = t.store.getState();
    expect(state.selectedLocation?.key).toBe(A.key);
    expect(state.snapshot?.location.key).toBe(A.key);
    expect(state.locationFlow).toEqual({ status: 'idle' });
    expect(t.weatherProvider.currentScript.calls.every((c) => c.args[0].key === A.key)).toBe(true);
  });

  it('slow weather for city A after selecting city B is discarded', async () => {
    const t = setup();
    t.weatherProvider.currentScript.hold();
    const loadingA = t.controller.chooseCandidate(A);
    await flush();
    t.weatherProvider.currentScript.release();
    await t.controller.chooseCandidate(B);
    expect(t.weatherProvider.currentScript.calls[0]?.aborted).toBe(true);
    // City A's answer finally arrives.
    t.weatherProvider.currentScript.calls[0]?.resolve(ok({ temperatureC: 99 }));
    await loadingA;
    const snap = t.store.getState().snapshot;
    expect(snap?.location.key).toBe(B.key);
    expect(snap?.current.data?.temperatureC).toBe(B.latitude);
    expect(t.store.getState().selectedLocation?.key).toBe(B.key);
  });

  it('an empty search does not cancel work in progress', async () => {
    const t = setup();
    t.weatherProvider.currentScript.hold();
    const loading = t.controller.chooseCandidate(A);
    await flush();
    await t.controller.searchCity('   ');
    expect(t.store.getState().search).toMatchObject({ status: 'error', error: { code: 'EMPTY_INPUT' } });
    expect(t.geocoding.searchScript.callCount).toBe(0);
    expect(t.weatherProvider.currentScript.calls[0]?.aborted).toBe(false);
    t.weatherProvider.currentScript.pending[0]?.resolve(ok({ temperatureC: 1 }));
    await loading;
    expect(t.store.getState().snapshot?.current.status).toBe('ready');
  });

  it('a failed search leaves a superseded load settled rather than stuck loading', async () => {
    const t = setup();
    t.weatherProvider.currentScript.hold();
    t.weatherProvider.forecastScript.hold();
    const loading = t.controller.chooseCandidate(A);
    await flush();
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await t.controller.searchCity('zzz');
    t.weatherProvider.currentScript.pending.forEach((c) => c.resolve(ok({})));
    t.weatherProvider.forecastScript.pending.forEach((c) => c.resolve(ok([])));
    await loading;
    const snap = t.store.getState().snapshot;
    expect(snap?.current.status).not.toBe('loading');
    expect(snap?.forecast.status).not.toBe('loading');
    expect(t.store.getState().search).toMatchObject({ status: 'error', error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});

describe('search flow', () => {
  it('one match is selected and its weather loaded', async () => {
    const t = setup();
    t.geocoding.searchScript.respondWith(ok([A]));
    await t.controller.searchCity('  city one ');
    expect(t.geocoding.searchScript.calls[0]?.args[0]).toBe('city one');
    expect(t.store.getState().selectedLocation).toEqual(A);
    expect(t.store.getState().search).toEqual({ status: 'idle' });
  });

  it('several matches wait for a choice', async () => {
    const t = setup();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await t.controller.searchCity('city');
    expect(t.store.getState().search).toMatchObject({ status: 'choose' });
    expect(t.weatherProvider.currentScript.callCount).toBe(0);
    await t.controller.chooseCandidate(B);
    expect(t.store.getState().selectedLocation?.key).toBe(B.key);
    expect(t.store.getState().search).toEqual({ status: 'idle' });
  });

  it('not found and service errors are shown as search errors', async () => {
    const t = setup();
    await t.controller.searchCity('nowhere');
    expect(t.store.getState().search).toMatchObject({ status: 'error', error: { code: 'NOT_FOUND' } });
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await t.controller.searchCity('x');
    expect(t.store.getState().search).toMatchObject({ status: 'error', error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});

describe('favorites', () => {
  it('selecting a favorite loads by stored coordinates without calling search', async () => {
    const t = setup();
    await t.controller.chooseCandidate(A);
    await t.controller.addFavorite();
    await t.controller.chooseCandidate(B);
    await t.controller.selectFavorite(A.key);
    expect(t.geocoding.searchScript.callCount).toBe(0);
    const last = t.weatherProvider.currentScript.calls.at(-1);
    expect(last?.args[0]).toMatchObject({ key: A.key, latitude: A.latitude, longitude: A.longitude });
    expect(t.store.getState().selectedLocation?.key).toBe(A.key);
  });

  it('add, duplicate and remove; removing the displayed favorite keeps the weather', async () => {
    const t = setup();
    await t.controller.chooseCandidate(A);
    expect(favoriteAvailability(t.store.getState())).toBe('can-add');
    await t.controller.addFavorite();
    expect(favoriteAvailability(t.store.getState())).toBe('already-favorite');
    await t.controller.addFavorite();
    expect(t.store.getState().messages.map((m) => m.messageId)).toContain('ui.favoriteDuplicate');
    expect(t.store.getState().favorites).toHaveLength(1);
    await t.controller.removeFavorite(A.key);
    expect(t.store.getState().favorites).toHaveLength(0);
    expect(t.store.getState().snapshot?.current.status).toBe('ready');
    expect(favoriteAvailability(t.store.getState())).toBe('can-add');
  });

  it('storage failure shows the notice flag and keeps the list in memory', async () => {
    const kv = new InMemoryKeyValueStore();
    kv.fail.set = true;
    const t = setup({ store: kv });
    await t.controller.chooseCandidate(A);
    await t.controller.addFavorite();
    expect(t.store.getState().favorites).toHaveLength(1);
    expect(t.store.getState().favoritesStorageUnavailable).toBe(true);
  });

  it('adding with nothing selected posts a message', async () => {
    const t = setup();
    await t.controller.addFavorite();
    expect(t.store.getState().messages.map((m) => m.messageId)).toEqual(['ui.favoriteNothingSelected']);
  });

  it('device location without reverse cannot be favorited and nothing is stored', async () => {
    const t = setup({ permission: 'granted' });
    t.location.positionScript.respondWith(coords);
    await t.controller.useMyLocation();
    expect(favoriteAvailability(t.store.getState())).toBe('needs-named-place');
    await t.controller.addFavorite();
    expect(t.store.getState().favorites).toEqual([]);
    expect(t.store.getState().messages.map((m) => m.messageId)).toContain('ui.favoriteNeedsName');
    expect(t.kv.data.has(FAVORITES_STORAGE_KEY)).toBe(false);
  });

  it('device location resolved to a named place saves that place, not the device coordinates', async () => {
    const t = setup({ permission: 'granted', withReverse: true });
    t.location.positionScript.respondWith(coords);
    t.geocoding.reverseScript?.respondWith(ok(city(7, { latitude: 10.5, longitude: -20.25 })));
    await t.controller.useMyLocation();
    expect(favoriteAvailability(t.store.getState())).toBe('can-add');
    await t.controller.addFavorite();
    const stored = t.kv.data.get(FAVORITES_STORAGE_KEY) ?? '';
    expect(t.store.getState().favorites.map((f) => f.key)).toEqual(['test:7']);
    expect(stored).toContain('10.5');
    expect(stored).not.toContain('33.3');
    expect(stored).not.toContain('44.4');
    expect(favoriteAvailability(t.store.getState())).toBe('already-favorite');
  });
});

describe('refresh and settings', () => {
  it('rapid refreshes produce one provider call per section', async () => {
    const t = setup();
    await t.controller.chooseCandidate(A);
    t.weatherProvider.currentScript.hold();
    t.weatherProvider.forecastScript.hold();
    const before = [t.weatherProvider.currentScript.callCount, t.weatherProvider.forecastScript.callCount];
    const all = Array.from({ length: 5 }, () => t.controller.refresh());
    await flush();
    expect(t.weatherProvider.currentScript.callCount - (before[0] ?? 0)).toBe(1);
    expect(t.weatherProvider.forecastScript.callCount - (before[1] ?? 0)).toBe(1);
    t.weatherProvider.currentScript.pending.forEach((c) => c.resolve(ok({ temperatureC: 5 })));
    t.weatherProvider.forecastScript.pending.forEach((c) => c.resolve(ok([])));
    await Promise.all(all);
    expect(t.store.getState().snapshot?.current.data?.temperatureC).toBe(5);
  });

  it('refresh with nothing displayed does nothing', async () => {
    const t = setup();
    await t.controller.refresh();
    expect(t.weatherProvider.currentScript.callCount).toBe(0);
  });

  it('a failed refresh keeps the displayed values', async () => {
    const t = setup();
    await t.controller.chooseCandidate(A);
    t.weatherProvider.currentScript.respondWith(err(serviceUnavailable()));
    await t.controller.refresh();
    const snap = t.store.getState().snapshot;
    expect(snap?.current.status).toBe('error');
    expect(snap?.current.data?.temperatureC).toBe(A.latitude);
  });

  it('a refresh is cancelled when the selection changes', async () => {
    const t = setup();
    await t.controller.chooseCandidate(A);
    t.weatherProvider.currentScript.hold();
    const refreshing = t.controller.refresh();
    await flush();
    t.weatherProvider.currentScript.release();
    await t.controller.chooseCandidate(B);
    expect(t.weatherProvider.currentScript.calls.find((c) => c.args[0].key === A.key && c.aborted)).toBeDefined();
    t.weatherProvider.currentScript.pending.forEach((c) => c.resolve(ok({ temperatureC: 99 })));
    await refreshing;
    const snapshot = t.store.getState().snapshot;
    expect(snapshot?.location.key).toBe(B.key);
    // A's late refresh result (99) must not appear in B's data.
    expect(snapshot?.current.data?.temperatureC).toBe(B.latitude);
    expect(snapshot?.current.data?.temperatureC).not.toBe(99);
  });

  it('the temperature unit is stored and persisted', async () => {
    const t = setup();
    await t.controller.setTemperatureUnit('F');
    expect(t.store.getState().temperatureUnit).toBe('F');
    expect(t.settings.getTemperatureUnit()).toBe('F');
  });
});

describe('review fixes M1, M2, M3, L6', () => {
  it('M1: a second "Use my location" from another place never shows the first place\'s data', async () => {
    const t = setup({ permission: 'granted' });
    t.location.positionScript.respondWith(ok({ lat: 10, lon: 20 }));
    await t.controller.useMyLocation();
    expect(t.store.getState().snapshot?.current.data?.temperatureC).toBe(10);
    // The user moved, and now the weather request fails.
    t.location.positionScript.respondWith(ok({ lat: 50, lon: 60 }));
    t.weatherProvider.currentScript.respondWith(err(serviceUnavailable()));
    await t.controller.useMyLocation();
    const snap = t.store.getState().snapshot;
    expect(snap?.location.latitude).toBe(50);
    expect(snap?.current.status).toBe('error');
    expect(snap?.current.data).toBeUndefined();
    expect(snap?.current.updatedAt).toBeUndefined();
  });

  it('M1: the unresolved device key and its coordinates are never written to storage', async () => {
    const t = setup({ permission: 'granted' });
    // Give storage real content first, so "nothing leaked" is not true merely because nothing is stored.
    await t.controller.chooseCandidate(A);
    await t.controller.addFavorite();
    await t.controller.setTemperatureUnit('F');
    const before = new Map(t.kv.data);
    const writesBefore = t.kv.setCalls;
    expect(before.size).toBe(2);

    t.location.positionScript.respondWith(coords);
    await t.controller.useMyLocation();
    expect(t.store.getState().selectedLocation?.key).toMatch(/^device:current:/);
    await t.controller.addFavorite();

    expect(t.kv.setCalls).toBe(writesBefore); // the device flow wrote nothing at all
    expect(t.kv.data).toEqual(before);
    const everything = [...t.kv.data.entries()].flat().join('\n');
    for (const needle of ['device:', '33.3', '44.4']) expect(everything).not.toContain(needle);
  });

  it('M2: a failed locate keeps the finished city and its data', async () => {
    const t = setup({ permission: 'granted' });
    await t.controller.chooseCandidate(A);
    const calls = t.weatherProvider.currentScript.callCount;
    t.location.positionScript.respondWith(err({ code: 'TIMEOUT', messageKey: 'error.timeout' }));
    await t.controller.useMyLocation();
    const state = t.store.getState();
    expect(state.selectedLocation?.key).toBe(A.key);
    expect(state.snapshot?.current.data?.temperatureC).toBe(A.latitude);
    expect(state.locationFlow).toMatchObject({ status: 'error', error: { code: 'TIMEOUT' } });
    expect(t.weatherProvider.currentScript.callCount).toBe(calls);
  });

  it('M2: a failed locate does not cancel the selected city\'s load that is still in flight', async () => {
    const t = setup({ permission: 'granted' });
    t.weatherProvider.currentScript.hold();
    const loading = t.controller.chooseCandidate(A);
    await flush();
    t.location.positionScript.respondWith(err({ code: 'LOCATION_DENIED', messageKey: 'error.locationDenied' }));
    await t.controller.useMyLocation();
    expect(t.weatherProvider.currentScript.calls[0]?.aborted).toBe(false);
    t.weatherProvider.currentScript.pending[0]?.resolve(ok({ temperatureC: 7 }));
    await loading;
    const snap = t.store.getState().snapshot;
    expect(snap?.location.key).toBe(A.key);
    expect(snap?.current.status).toBe('ready');
    expect(snap?.current.data?.temperatureC).toBe(7);
    expect(t.store.getState().locationFlow).toMatchObject({ status: 'error' });
  });

  it('M2: a locate that resolves still replaces the selected city', async () => {
    const t = setup({ permission: 'granted' });
    await t.controller.chooseCandidate(A);
    t.location.positionScript.respondWith(coords);
    await t.controller.useMyLocation();
    expect(t.store.getState().selectedLocation?.source).toBe('device');
    expect(t.store.getState().snapshot?.current.data?.temperatureC).toBe(33.3);
  });

  it('M2: a search still waiting is superseded by a newer "Use my location"', async () => {
    const t = setup({ permission: 'granted' });
    t.geocoding.searchScript.hold();
    const searching = t.controller.searchCity('slow');
    await flush();
    t.location.positionScript.respondWith(coords);
    await t.controller.useMyLocation();
    t.geocoding.searchScript.pending[0]?.resolve(ok([A]));
    await searching;
    expect(t.store.getState().selectedLocation?.source).toBe('device');
    expect(t.store.getState().search.status).toBe('idle');
  });

  it('M3: a refresh during the initial load makes no second request', async () => {
    const t = setup();
    t.weatherProvider.currentScript.hold();
    t.weatherProvider.forecastScript.hold();
    const loading = t.controller.chooseCandidate(A);
    await flush();
    await t.controller.refresh();
    expect(t.weatherProvider.currentScript.callCount).toBe(1);
    expect(t.weatherProvider.forecastScript.callCount).toBe(1);
    t.weatherProvider.currentScript.pending.forEach((c) => c.resolve(ok({ temperatureC: 3 })));
    t.weatherProvider.forecastScript.pending.forEach((c) => c.resolve(ok([])));
    await loading;
    expect(t.store.getState().snapshot?.current.data?.temperatureC).toBe(3);
    // Once the load is done, a refresh is a real request again.
    t.weatherProvider.currentScript.release();
    t.weatherProvider.forecastScript.release();
    await t.controller.refresh();
    expect(t.weatherProvider.currentScript.callCount).toBe(2);
  });

  it('L6: a later successful selection clears an earlier location error', async () => {
    const t = setup({ permission: 'denied' });
    await t.controller.useMyLocation();
    expect(t.store.getState().locationFlow.status).toBe('error');
    t.geocoding.searchScript.respondWith(ok([A]));
    await t.controller.searchCity('city one');
    expect(t.store.getState().locationFlow).toEqual({ status: 'idle' });
    await t.controller.useMyLocation();
    expect(t.store.getState().locationFlow.status).toBe('error');
    await t.controller.chooseCandidate(B);
    expect(t.store.getState().locationFlow).toEqual({ status: 'idle' });
  });

  it('L6: a later successful selection clears an earlier search error', async () => {
    const t = setup({ permission: 'granted' });
    await t.controller.searchCity('nowhere');
    expect(t.store.getState().search.status).toBe('error');
    t.location.positionScript.respondWith(coords);
    await t.controller.useMyLocation();
    expect(t.store.getState().search).toEqual({ status: 'idle' });
  });

  it('L6: a settings-storage failure is surfaced and the unit still applies', async () => {
    const kv = new InMemoryKeyValueStore();
    kv.fail.set = true;
    const t = setup({ store: kv });
    await t.controller.setTemperatureUnit('F');
    expect(t.store.getState().temperatureUnit).toBe('F');
    expect(t.store.getState().messages.map((m) => m.messageId)).toContain('ui.settingsNotSaved');
  });

  it('L6: no settings notice when storage works', async () => {
    const t = setup();
    await t.controller.setTemperatureUnit('F');
    expect(t.store.getState().messages).toEqual([]);
  });
});

describe('failures never become unhandled rejections', () => {
  it('every intent resolves when every port throws', async () => {
    const t = setup({ permission: 'granted' });
    t.geocoding.searchScript.failWith(new Error('geo'));
    t.weatherProvider.currentScript.failWith(new Error('weather'));
    t.weatherProvider.forecastScript.failWith(new Error('weather'));
    t.location.positionScript.failWith(new Error('loc'));
    await expect(t.controller.start()).resolves.toBeUndefined();
    await expect(t.controller.searchCity('x')).resolves.toBeUndefined();
    expect(t.store.getState().search).toMatchObject({ status: 'error', error: { code: 'SERVICE_UNAVAILABLE' } });
    await expect(t.controller.chooseCandidate(A)).resolves.toBeUndefined();
    await expect(t.controller.useMyLocation()).resolves.toBeUndefined();
    await expect(t.controller.refresh()).resolves.toBeUndefined();
    await expect(t.controller.addFavorite()).resolves.toBeUndefined();
    await expect(t.controller.selectFavorite(A.key)).resolves.toBeUndefined();
    await expect(t.controller.removeFavorite(A.key)).resolves.toBeUndefined();
    await expect(t.controller.setTemperatureUnit('F')).resolves.toBeUndefined();
    expect(t.store.getState().snapshot?.current.error?.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a superseded search or locate leaves no stuck "in progress" state', async () => {
    const t = setup({ permission: 'granted' });
    t.geocoding.searchScript.hold();
    const searching = t.controller.searchCity('slow');
    await flush();
    expect(t.store.getState().search.status).toBe('loading');
    await t.controller.chooseCandidate(A);
    expect(t.store.getState().search.status).toBe('idle');
    t.geocoding.searchScript.pending[0]?.resolve(ok([B]));
    await searching;
    expect(t.store.getState().selectedLocation?.key).toBe(A.key);
    expect(t.store.getState().search.status).toBe('idle');
  });

  it('an exception thrown by a subscriber is isolated: the intent completes and later subscribers still run', async () => {
    const t = setup();
    t.store.subscribe(() => {
      throw new Error('listener bug');
    });
    const seen: Array<string | undefined> = [];
    t.store.subscribe((s) => seen.push(s.snapshot?.current.status));
    await expect(t.controller.chooseCandidate(A)).resolves.toBeUndefined();
    expect(t.store.getState().selectedLocation?.key).toBe(A.key);
    expect(t.store.getState().snapshot?.current.status).toBe('ready');
    expect(t.store.getState().snapshot?.current.data?.temperatureC).toBe(A.latitude);
    expect(seen.at(-1)).toBe('ready');
  });
});

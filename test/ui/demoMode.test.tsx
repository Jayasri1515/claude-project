// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../src/core/result';
import { compose } from '../../src/composition';
import { FAVORITES_STORAGE_KEY } from '../../src/core/favorites/favoritesService';
import { message } from '../../src/core/messages';
import { SETTINGS_STORAGE_KEY } from '../../src/core/settings';
import { composeDemo, DEMO_STORAGE_PREFIX } from '../../src/dev/demoComposition';
import { DemoGeocodingProvider, DemoLocationService, DemoWeatherProvider } from '../../src/dev/demoProviders';
import { App } from '../../src/ui/App';
import { FakeClock, FakeGeocodingProvider, FakeWeatherProvider, InMemoryKeyValueStore } from '../fakes';
import { city } from './helpers';

const never = new AbortController().signal;
const live = () => ({ geocoding: new FakeGeocodingProvider(), weather: new FakeWeatherProvider() });

describe('Demo mode is opt-in, never the silent default (review M6)', () => {
  it('with nothing injected and no opt-in, the app is unconfigured, not demo', () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore() });
    expect(c.mode).toBe('unconfigured');
    expect(c.unconfigured).toBe(true);
    expect(c.demo).toBe(false);
  });

  it('demo comes only from composeDemo; compose() alone never produces it', () => {
    expect(compose({ keyValueStore: new InMemoryKeyValueStore(), demo: true }).mode).toBe('unconfigured');
    const c = composeDemo({ keyValueStore: new InMemoryKeyValueStore() });
    expect(c.mode).toBe('demo');
    expect(c.demo).toBe(true);
    expect(c.unconfigured).toBe(false);
  });

  it('injected providers mean live mode, even if demo is also requested', () => {
    const c = composeDemo({ keyValueStore: new InMemoryKeyValueStore(), ...live() });
    expect(c.mode).toBe('live');
    expect(c.demo).toBe(false);
  });

  it('unconfigured: the page says so through the message table and offers no fake data or controls', () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore() });
    render(
      <App store={c.store} controller={c.controller} config={c.config} demo={c.demo} unconfigured={c.unconfigured} />,
    );
    expect(screen.getByRole('heading', { name: 'Weather is not set up yet' })).toBeTruthy();
    expect(screen.getByText(/No weather data source is configured/)).toBeTruthy();
    expect(screen.queryByLabelText('City name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use my location' })).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Testville|Demo mode/);
    // L4: the "sent to the weather service" disclosure belongs to the search/location controls, which are absent here.
    expect(document.body.textContent).not.toContain(message('ui.location.disclosure'));
    expect(document.body.textContent).not.toMatch(/IP address|may log requests|sent to/);
  });

  it('unconfigured: even a direct search intent produces an error, never invented places', async () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore() });
    await c.controller.searchCity('Testville');
    expect(c.store.getState().search.status).toBe('error');
    expect(c.store.getState().snapshot).toBeUndefined();
  });

  it('demo: the notice is the first thing in the banner and says the data is made up', () => {
    const c = composeDemo({ keyValueStore: new InMemoryKeyValueStore() });
    render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} />);
    const first = screen.getByRole('banner').firstElementChild;
    expect(first?.classList.contains('demo-notice')).toBe(true);
    expect(first?.getAttribute('role')).toBe('note');
    expect(first?.textContent).toMatch(/made-up sample data/);
  });

  it('demo: saved data lives under its own prefix and never mixes with real storage', async () => {
    const kv = new InMemoryKeyValueStore();
    const real = compose({ keyValueStore: kv, ...live() });
    await real.controller.chooseCandidate(city(1, { name: 'Realville' }));
    await real.controller.addFavorite();
    expect([...kv.data.keys()]).toContain(FAVORITES_STORAGE_KEY);

    const demo = composeDemo({ keyValueStore: kv });
    await demo.controller.start();
    expect(demo.store.getState().favorites).toEqual([]);

    const place = await new DemoGeocodingProvider().search('Testville', 5, never);
    if (!place.ok) throw new Error('unexpected');
    await demo.controller.chooseCandidate(place.value[0]!);
    await demo.controller.addFavorite();
    await demo.controller.setTemperatureUnit('F');
    expect(kv.data.has(DEMO_STORAGE_PREFIX + FAVORITES_STORAGE_KEY)).toBe(true);
    expect(kv.data.has(DEMO_STORAGE_PREFIX + SETTINGS_STORAGE_KEY)).toBe(true);
    // The real entries are untouched.
    expect(kv.data.get(FAVORITES_STORAGE_KEY)).toContain('Realville');
    expect(kv.data.get(FAVORITES_STORAGE_KEY)).not.toContain('Testville');
    expect(kv.data.has(SETTINGS_STORAGE_KEY)).toBe(false);
  });

  it('demo: forecast dates follow the Clock, not a fixed date', async () => {
    const clock = new FakeClock('2030-05-17T10:00:00Z');
    const weather = new DemoWeatherProvider(clock);
    const place = await new DemoGeocodingProvider().search('Testville', 5, never);
    if (!place.ok) throw new Error('unexpected');
    const loc = place.value[0]!;
    const dates = async (includeToday: boolean): Promise<string[]> => {
      const r = await weather.getForecast(loc, 3, includeToday, never);
      return r.ok ? r.value.map((d) => d.date) : [];
    };
    expect(await dates(false)).toEqual(['2030-05-18', '2030-05-19', '2030-05-20']);
    expect(await dates(true)).toEqual(['2030-05-17', '2030-05-18', '2030-05-19']);
    clock.advance(3 * 86_400_000);
    expect(await dates(false)).toEqual(['2030-05-21', '2030-05-22', '2030-05-23']);
  });

  it('demo: the DemoLocationService itself reports unsupported and no position', async () => {
    const service = new DemoLocationService();
    expect(await service.getPermissionState()).toBe('unsupported');
    expect((await service.getCurrentPosition()).ok).toBe(false);
  });

  describe('with a working platform Geolocation present (wiring check)', () => {
    // A platform that WOULD give a position and say "granted". If compose() wired the real
    // BrowserLocationService into demo mode, these stubs would be called and a location shown.
    const getCurrentPosition = vi.fn((success: (p: unknown) => void) =>
      success({ coords: { latitude: 51.5, longitude: -0.12 }, timestamp: 0 }),
    );
    const query = vi.fn(() => Promise.resolve({ state: 'granted' }));
    const original = {
      geolocation: Object.getOwnPropertyDescriptor(navigator, 'geolocation'),
      permissions: Object.getOwnPropertyDescriptor(navigator, 'permissions'),
    };
    beforeEach(() => {
      getCurrentPosition.mockClear();
      query.mockClear();
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
    });
    afterEach(() => {
      for (const name of ['geolocation', 'permissions'] as const) {
        const d = original[name];
        if (d) Object.defineProperty(navigator, name, d);
        else delete (navigator as unknown as Record<string, unknown>)[name];
      }
    });

    it('control: in live mode (no locationService injected) the real adapter reads the stubbed platform', async () => {
      const user = userEvent.setup();
      const geocoding = new FakeGeocodingProvider();
      const weather = new FakeWeatherProvider();
      weather.currentScript.respondWith(ok({ temperatureC: 1 }));
      const c = compose({ keyValueStore: new InMemoryKeyValueStore(), geocoding, weather });
      render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} />);
      await user.click(screen.getByRole('button', { name: 'Use my location' }));
      expect(await screen.findByRole('heading', { name: 'Current location' })).toBeTruthy();
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    it('demo: the platform position and permission are never read, even on launch and on click', async () => {
      const user = userEvent.setup();
      const c = composeDemo({ keyValueStore: new InMemoryKeyValueStore() });
      render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} />);
      await act(() => c.controller.start());
      const demoStatement = screen.getByText(/^Demo mode: nothing you type is sent to a weather service/);
      expect(demoStatement.textContent).toMatch(/your device location is not used/);
      // L4: the live disclosure ("... sent to the weather service ...") would be false here and must not appear.
      expect(screen.queryByText(/IP address/)).toBeNull();
      expect(screen.queryByText(/may log requests/)).toBeNull();
      expect(document.body.textContent).not.toContain(message('ui.location.disclosure'));
      // The button is described by the demo statement, not by a hidden or missing element.
      const describedBy = screen.getByRole('button', { name: 'Use my location' }).getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(describedBy)?.textContent).toBe(message('ui.location.demoNote'));
      await user.click(screen.getByRole('button', { name: 'Use my location' }));
      expect(await screen.findByText(/could not be determined/)).toBeTruthy();
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Current location' })).toBeNull();
      expect(c.store.getState().selectedLocation).toBeUndefined();
    });
  });

  it('live mode shows neither the demo notice nor the demo location note', () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore(), ...live() });
    render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(/device location is not used/)).toBeNull();
    expect(screen.queryByText(/nothing you type is sent/)).toBeNull();
    expect(screen.getByText(message('ui.location.disclosure'))).toBeTruthy();
  });
});

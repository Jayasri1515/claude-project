// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compose } from '../../src/composition';
import { message } from '../../src/core/messages';
import { ok } from '../../src/core/result';
import { App } from '../../src/ui/App';
import { InMemoryKeyValueStore, LegacyFakeGeocodingProvider, LegacyFakeWeatherProvider } from '../fakes';

afterEach(() => cleanup());

const live = () => ({ geocoding: new LegacyFakeGeocodingProvider(), weather: new LegacyFakeWeatherProvider() });

// Salvaged from the retired demo-mode suite (impl-plan T-14, test-triage.md): the modes that remain are "live" and
// "unconfigured"; there is no invented-data mode.
describe('composition modes: live and unconfigured', () => {
  it('with nothing injected the app is unconfigured', () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore() });
    expect(c.mode).toBe('unconfigured');
    expect(c.unconfigured).toBe(true);
  });

  it('injected providers mean live mode', () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore(), ...live() });
    expect(c.mode).toBe('live');
    expect(c.unconfigured).toBe(false);
  });

  it('unconfigured: the page says so through the message table and offers no data or controls', () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore() });
    render(<App store={c.store} controller={c.controller} config={c.config} unconfigured={c.unconfigured} />);
    expect(screen.getByRole('heading', { name: 'Weather is not set up yet' })).toBeTruthy();
    expect(screen.getByText(/No weather data source is configured/)).toBeTruthy();
    expect(screen.queryByLabelText('City name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use my location' })).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
    // The privacy disclosure (footer) belongs to the live page, which sends nothing here.
    expect(document.body.textContent).not.toContain(message('ui.footer.privacy'));
    expect(document.body.textContent).not.toMatch(/IP address|server logs|sent to/);
  });

  it('unconfigured: even a direct search intent produces an error, never invented places', async () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore() });
    await c.controller.searchCity('Anywhere');
    expect(c.store.getState().search.status).toBe('error');
    expect(c.store.getState().snapshot).toBeUndefined();
  });

  it('live mode shows the footer privacy disclosure and no notice banner', () => {
    const c = compose({ keyValueStore: new InMemoryKeyValueStore(), ...live() });
    render(<App store={c.store} controller={c.controller} config={c.config} />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByText(message('ui.footer.privacy'))).toBeTruthy();
  });

  describe('with a working platform Geolocation present (wiring check)', () => {
    // A platform that WOULD give a position and say "granted": proves compose() wires the real browser adapter.
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

    it('with no locationService injected, the real adapter reads the stubbed platform', async () => {
      const user = userEvent.setup();
      const weather = new LegacyFakeWeatherProvider();
      weather.currentScript.respondWith(ok({ temperatureC: 1 }));
      const c = compose({ keyValueStore: new InMemoryKeyValueStore(), geocoding: new LegacyFakeGeocodingProvider(), weather });
      render(<App store={c.store} controller={c.controller} config={c.config} />);
      await user.click(screen.getByRole('button', { name: 'Use my location' }));
      expect(await screen.findByRole('heading', { name: 'Current location' })).toBeTruthy();
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });
});

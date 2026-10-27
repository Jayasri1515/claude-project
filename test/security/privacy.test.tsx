// @vitest-environment jsdom
/**
 * TASK-041 (security and privacy) runtime checks in jsdom, over the real
 * composition with the real LocalStorageStore on jsdom's localStorage:
 *  - search text is never persisted or logged (NFR-005; closes a gap in verification.md A9),
 *  - device coordinates are never persisted or logged,
 *  - hostile provider and user text renders as text only (NFR-006).
 * jsdom is not a real browser: real-browser storage and console output are inspected in e2e/browserApis.spec.ts (NFR-005 and "network and console" tests).
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compose } from '../../src/composition';
import { createConfig } from '../../src/core/config';
import { err, ok } from '../../src/core/result';
import { serviceUnavailable } from '../../src/core/errors';
import { App } from '../../src/ui/App';
import { FakeClock, FakeGeocodingProvider, FakeLocationService, FakeWeatherProvider } from '../fakes';
import { city } from '../ui/helpers';

const QUERY = 'Qx7-UNIQUE-SEARCH-TEXT';
const DEVICE = { lat: 33.123456, lon: 44.654321 };
const LOGGERS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

/** Everything a page can persist or leak through browser storage. */
function persistedText(): string {
  const parts: string[] = [];
  for (const area of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < area.length; i += 1) {
      const key = area.key(i) ?? '';
      parts.push(key, area.getItem(key) ?? '');
    }
  }
  parts.push(document.cookie, window.location.href, window.name, document.title);
  return parts.join('\n');
}

function build(options: { withReverse?: boolean } = {}) {
  const geocoding = new FakeGeocodingProvider({ withReverse: options.withReverse ?? false });
  const weather = new FakeWeatherProvider();
  const location = new FakeLocationService('prompt');
  const c = compose({ config: createConfig(), geocoding, weather, locationService: location, clock: new FakeClock() });
  weather.currentScript.respondWith(ok({ temperatureC: 5, humidityPct: 5, condition: 'CLEAR' }));
  weather.forecastScript.respondWith(ok([]));
  render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} />);
  return { c, geocoding, weather, location };
}

let spies: Array<ReturnType<typeof vi.spyOn>>;
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  spies = LOGGERS.map((name) => vi.spyOn(console, name).mockImplementation(() => undefined));
});
afterEach(() => {
  vi.restoreAllMocks();
});
const logged = (): string => JSON.stringify(spies.flatMap((s) => s.mock.calls));

describe('Search text is never persisted or logged (NFR-005)', () => {
  it('after found, not-found, error and empty searches plus favorites and a unit change, storage holds no search text', async () => {
    const user = userEvent.setup();
    const t = build();
    const input = () => screen.getByLabelText('City name');
    t.geocoding.searchScript.respondWith(ok([city(1, { name: 'Foundville' })]));
    await user.type(input(), `${QUERY}{Enter}`);
    await screen.findByRole('heading', { name: /Foundville/ });
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await user.click(screen.getByRole('radio', { name: '°F' }));

    t.geocoding.searchScript.respondWith(ok([]));
    await user.clear(input());
    await user.type(input(), `${QUERY}-NOTFOUND{Enter}`);
    await screen.findByText(/City not found/);
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await user.clear(input());
    await user.type(input(), `${QUERY}-ERROR{Enter}`);
    await screen.findByText(/weather service is unavailable/);

    // The control: something WAS persisted (so an empty scan would be noticed), but never the text.
    expect(window.localStorage.length).toBeGreaterThan(0);
    expect(persistedText()).toContain('Foundville');
    expect(persistedText()).not.toContain(QUERY);
    expect(logged()).not.toContain(QUERY);
  });

  it('the persisted-text scan can fail: it finds search text if something stores it', () => {
    window.localStorage.setItem('leak', `last-search=${QUERY}`);
    expect(persistedText()).toContain(QUERY);
  });

  it('search text goes to the geocoding port only, once per submit, and nowhere else', async () => {
    const user = userEvent.setup();
    const t = build();
    await user.type(screen.getByLabelText('City name'), `${QUERY}{Enter}`);
    await screen.findByText(/City not found/);
    expect(t.geocoding.searchScript.calls.map((c) => c.args[0])).toEqual([QUERY]);
    expect(JSON.stringify(t.weather.currentScript.calls.map((c) => c.args))).not.toContain(QUERY);
    expect(JSON.stringify(t.weather.forecastScript.calls.map((c) => c.args))).not.toContain(QUERY);
  });
});

describe('Device coordinates are never persisted or logged (NFR-005, F-004)', () => {
  it('unresolved device location: weather shown, favorite refused, nothing stored, nothing logged', async () => {
    const user = userEvent.setup();
    const t = build({ withReverse: false });
    t.location.positionScript.respondWith(ok(DEVICE));
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    await screen.findByRole('heading', { name: 'Current location' });
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    await act(() => t.c.controller.addFavorite()); // direct intent too
    const text = persistedText();
    for (const needle of ['33.123456', '44.654321', 'device:', 'Current location']) expect(text).not.toContain(needle);
    expect(logged()).not.toContain('33.123456');
    // The coordinates did reach the weather port (that is the disclosed purpose) and only that.
    expect(t.weather.currentScript.calls[0]?.args[0].latitude).toBe(DEVICE.lat);
  });

  it('device location resolved to a named place: only that place (its own coordinates) is stored', async () => {
    const user = userEvent.setup();
    const t = build({ withReverse: true });
    t.location.positionScript.respondWith(ok(DEVICE));
    t.geocoding.reverseScript?.respondWith(ok(city(5, { name: 'Namedtown', latitude: 12.5, longitude: 13.5 })));
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    await screen.findByRole('heading', { name: /Namedtown/ });
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    const text = persistedText();
    expect(text).toContain('Namedtown');
    expect(text).toContain('12.5');
    expect(text).not.toContain('33.123456');
    expect(text).not.toContain('44.654321');
    expect(logged()).not.toContain('33.123456');
  });
});

describe('Untrusted text renders as text only (NFR-006)', () => {
  const hostile = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';

  it('hostile place names in the chooser, the weather heading and the favorites list create no elements', async () => {
    const user = userEvent.setup();
    const t = build();
    const a = city(1, { name: hostile, admin1: '<b>R</b>', country: '"><svg onload=alert(1)>' });
    const b = city(2, { name: hostile + '2', admin1: 'S', country: 'T' });
    t.geocoding.searchScript.respondWith(ok([a, b]));
    await user.type(screen.getByLabelText('City name'), 'x{Enter}');
    await screen.findByText('Several places match. Choose one:');
    await user.click(screen.getAllByRole('button').find((el) => el.textContent?.startsWith('<img src=x'))!);
    await screen.findByRole('heading', { name: /<img src=x/ });
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(within(screen.getByRole('region', { name: 'Favorites' })).getByText(/<img src=x/)).toBeTruthy();

    // The only <svg> elements are the app's own Lucide weather icons (TASK-035); none comes from the hostile text.
    for (const selector of ['img', 'script', 'svg:not(.weather-icon)', 'b', '[onload]', '[onerror]']) {
      expect(document.querySelector(`main ${selector}`), selector).toBeNull();
    }
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    // And what was stored is the literal text, not interpreted.
    expect(window.localStorage.getItem('weather-app.favorites')).toContain('<img src=x');
  });

  it('hostile condition text from a provider is displayed as text', async () => {
    const t = build();
    t.weather.currentScript.respondWith(ok({ temperatureC: 1, condition: 'UNKNOWN', conditionText: '<iframe src="javascript:alert(1)"></iframe>' }));
    await act(() => t.c.controller.chooseCandidate(city(1)));
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('region', { name: 'Current weather' }).textContent).toContain('<iframe src="javascript:alert(1)"></iframe>');
  });
});

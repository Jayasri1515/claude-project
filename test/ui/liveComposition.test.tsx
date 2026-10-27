// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeLive } from '../../src/composition';
import { createConfig } from '../../src/core/config';
import { ok } from '../../src/core/result';
import { App } from '../../src/ui/App';
import { FakeLocationService, InMemoryKeyValueStore } from '../fakes';
import { abortableHang, fixtureResponse, jsonResponse, stubFetch } from '../support/openMeteo';
import type { RecordedCall } from '../support/openMeteo';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * TASK-037: the composition a normal build uses (composeLive) over the real Open-Meteo adapters, driven by
 * RECORDED responses through a stubbed fetch. The live API is never called here.
 */
function route(call: RecordedCall): Response {
  const url = new URL(call.url);
  if (url.host === 'geocoding-api.open-meteo.com') return fixtureResponse('geocoding-berlin.json');
  if (url.searchParams.has('current')) return fixtureResponse('forecast-current.json');
  if (url.searchParams.has('daily')) return fixtureResponse('forecast-daily.json');
  return jsonResponse({ error: true }, 404);
}

function setup(respond: (call: RecordedCall) => Response | Promise<Response> = route, extra: Parameters<typeof composeLive>[0] = {}) {
  const stub = stubFetch(respond);
  const kv = new InMemoryKeyValueStore();
  const c = composeLive({ fetch: stub.fetch, keyValueStore: kv, locationService: new FakeLocationService('prompt'), ...extra });
  render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} unconfigured={c.unconfigured} />);
  return { ...c, ...stub, kv };
}

describe('composeLive (a normal build)', () => {
  it('is live mode: not demo, not unconfigured, so the real app is shown', async () => {
    const t = setup();
    await act(() => t.controller.start());
    expect(t.mode).toBe('live');
    expect(t.demo).toBe(false);
    expect(t.unconfigured).toBe(false);
    expect(screen.getByLabelText('City name')).toBeTruthy();
    expect(screen.queryByText('Weather is not set up yet')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull(); // no demo notice
    expect(t.calls).toHaveLength(0); // nothing is requested before the user does something
  });

  it('search -> choose -> weather works end to end over the recorded Open-Meteo responses', async () => {
    const user = userEvent.setup();
    const t = setup();
    await act(() => t.controller.start());

    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    const chooser = await screen.findByRole('group', { name: /Several places match/ });
    expect(within(chooser).getAllByRole('button')).toHaveLength(3); // the recording has three Berlins
    await user.click(within(chooser).getByRole('button', { name: 'Berlin, State of Berlin, Germany' }));

    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Berlin, State of Berlin, Germany' })).toBeTruthy();
    await waitFor(() => expect(within(current).getByText('Temperature')).toBeTruthy());
    expect(within(current).getByText(/10°C/)).toBeTruthy(); // 9.5 C, shown to whole degrees
    expect(within(current).getByText(/74%/)).toBeTruthy();
    expect(within(current).getByText(/Clear/)).toBeTruthy(); // WMO code 1
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    await waitFor(() => expect(within(forecast).getAllByRole('listitem')).toHaveLength(3));
  });

  it('every request goes to one of the two Open-Meteo hosts over HTTPS, GET only, no key, no credentials', async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' }));
    await waitFor(() => expect(t.calls.length).toBeGreaterThanOrEqual(3)); // one search + current + daily
    expect(t.calls).toHaveLength(3);
    for (const call of t.calls) {
      const url = new URL(call.url);
      expect(url.protocol).toBe('https:');
      expect(['geocoding-api.open-meteo.com', 'api.open-meteo.com']).toContain(url.host);
      expect(call.init.method).toBe('GET');
      expect(call.init.credentials).toBe('omit');
      expect(call.init.referrerPolicy).toBe('no-referrer');
      expect(call.init.headers).toBeUndefined();
      expect(call.url).not.toMatch(/api[_-]?key|apikey|token|secret/i);
    }
  });

  it('over-long input shows its own message and makes no request (C2)', async () => {
    const user = userEvent.setup();
    const t = setup();
    await user.click(screen.getByLabelText('City name'));
    await user.paste('x'.repeat(createConfig().maxInputLength + 1));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('That search is too long. Please enter a shorter city name.')).toBeTruthy();
    expect(screen.queryByText(/City not found/)).toBeNull();
    expect(t.calls).toHaveLength(0);
  });

  it('a search with no match says "City not found" (the recorded response has no results key)', async () => {
    const user = userEvent.setup();
    setup(() => fixtureResponse('geocoding-no-results.json'));
    await user.type(screen.getByLabelText('City name'), 'Zzqxjkvvwpl{Enter}');
    expect(await screen.findByText(/City not found/)).toBeTruthy();
  });

  it('a provider failure shows the generic service message and never provider text', async () => {
    const user = userEvent.setup();
    setup(() => fixtureResponse('geocoding-error-400.json', 400));
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Parameter count|reason|error":/);
  });

  it('a network failure on the forecast section leaves the current section working, with a retry', async () => {
    const user = userEvent.setup();
    setup((call) => {
      if (new URL(call.url).searchParams.has('daily')) throw new TypeError('Failed to fetch');
      return route(call);
    });
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' }));
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    expect(await within(forecast).findByText(/could not be reached/)).toBeTruthy();
    expect(within(forecast).getByRole('button', { name: /Retry/ })).toBeTruthy();
    const current = screen.getByRole('region', { name: 'Current weather' });
    await waitFor(() => expect(within(current).getByText('Temperature')).toBeTruthy());
  });

  it('a newer search aborts the older request\'s fetch', async () => {
    const user = userEvent.setup();
    const signals: Array<AbortSignal | undefined> = [];
    const t = setup((call) => {
      signals.push(call.init.signal ?? undefined);
      return signals.length === 1 ? new Promise<Response>(() => undefined) : route(call);
    });
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await waitFor(() => expect(signals).toHaveLength(1));
    await user.clear(screen.getByLabelText('City name'));
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await waitFor(() => expect(t.calls.length).toBeGreaterThanOrEqual(2));
    expect(signals[0]?.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' })).toBeTruthy();
  });
});

describe('composeLive: timeouts come from Config', () => {
  it('a search that never answers ends after Config.weatherTimeoutMs with the service-unavailable error, not a hang', async () => {
    vi.useFakeTimers();
    const stub = stubFetch((call) => abortableHang(call.init));
    const c = composeLive({ fetch: stub.fetch, config: createConfig({ weatherTimeoutMs: 4_000 }), keyValueStore: new InMemoryKeyValueStore() });
    const pending = c.controller.searchCity('Berlin');
    await vi.advanceTimersByTimeAsync(3_999);
    expect(c.store.getState().search.status).toBe('loading');
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(c.store.getState().search).toMatchObject({ status: 'error', error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(stub.calls[0]?.init.signal?.aborted).toBe(true);
  });
});

describe('composeLive: no reverse geocoding (user answer A4 = No)', () => {
  it('a device location shows weather without a named place, calls no geocoding endpoint, and cannot be favorited', async () => {
    const user = userEvent.setup();
    const location = new FakeLocationService('granted');
    location.positionScript.respondWith(ok({ lat: 12.5, lon: 77.25 }));
    const t = setup(route, { locationService: location });
    await user.click(screen.getByRole('button', { name: 'Use my location' }));

    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Current location' })).toBeTruthy();
    await waitFor(() => expect(within(current).getByText('Temperature')).toBeTruthy());

    // Only forecast requests were made: no geocoding search and no reverse lookup of any kind.
    expect(t.calls.length).toBeGreaterThan(0);
    expect(t.calls.every((c) => new URL(c.url).host === 'api.open-meteo.com')).toBe(true);
    expect(t.calls.some((c) => /reverse/i.test(c.url))).toBe(false);

    // The favorite control is not offered; a hint to search by name replaces it.
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    expect(screen.getByText('Search for the city by name to save it as a favorite.')).toBeTruthy();

    // The device coordinates are in the weather requests only; nothing was stored.
    expect(t.kv.data.size).toBe(0);
    expect(JSON.stringify([...t.kv.data.entries()])).not.toContain('12.5');
  });

});

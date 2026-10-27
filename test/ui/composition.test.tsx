// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { composeDemo } from '../../src/dev/demoComposition';
import { DemoGeocodingProvider, DemoWeatherProvider } from '../../src/dev/demoProviders';
import { createConfig } from '../../src/core/config';
import { App } from '../../src/ui/App';
import { FakeClock, FakeLocationService, InMemoryKeyValueStore } from '../fakes';

const never = new AbortController().signal;

describe('Composition root with demo providers (TASK-036)', () => {

  it('smoke: renders, and flows A to D can be exercised with no external service', async () => {
    const user = userEvent.setup();
    const kv = new InMemoryKeyValueStore();
    const c = composeDemo({ keyValueStore: kv, locationService: new FakeLocationService('prompt') });
    render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} />);
    await act(() => c.controller.start());
    expect(screen.getByRole('note').textContent).toContain('Demo mode');

    // Flow A: search -> weather.
    await user.type(screen.getByLabelText('City name'), 'Testville{Enter}');
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Testville, Testshire, Testland' }, { timeout: 3000 })).toBeTruthy();
    await waitFor(() => expect(within(current).getByText('Temperature')).toBeTruthy(), { timeout: 3000 });
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    await waitFor(() => expect(within(forecast).getAllByRole('listitem')).toHaveLength(3), { timeout: 3000 });

    // Flow D: favorite it.
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(await screen.findByRole('button', { name: 'Testville, Testshire, Testland Showing' })).toBeTruthy();

    // Flow C: refresh.
    await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(false), {
      timeout: 3000,
    });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(false), {
      timeout: 3000,
    });

    // Flow B: device location fails -> message, search remains.
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/could not be determined/)).toBeTruthy();
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
  }, 20000);
});

describe('Demo providers', () => {
  it('search: one match, two matches, none, scripted error', async () => {
    const geo = new DemoGeocodingProvider();
    const one = await geo.search('testville', 5, never);
    const two = await geo.search('Sampleton', 5, never);
    const none = await geo.search('Nowhere', 5, never);
    const bad = await geo.search('error', 5, never);
    expect(one.ok && one.value.length).toBe(1);
    expect(two.ok && two.value.length).toBe(2);
    expect(none.ok && none.value.length).toBe(0);
    expect(bad.ok).toBe(false);
  });

  it('search honors the limit and every place is a distinct, search-sourced location', async () => {
    const geo = new DemoGeocodingProvider();
    const limited = await geo.search('Sampleton', 1, never);
    expect(limited.ok && limited.value.length).toBe(1);
    const both = await geo.search('Sampleton', 5, never);
    if (both.ok) {
      expect(new Set(both.value.map((p) => p.key)).size).toBe(2);
      expect(both.value.every((p) => p.source === 'search')).toBe(true);
    }
  });

  it('weather: deterministic values, honors includeToday, aborts', async () => {
    const geo = new DemoGeocodingProvider();
    const places = await geo.search('Testville', 5, never);
    if (!places.ok) throw new Error('unexpected');
    const place = places.value[0]!;
    const weather = new DemoWeatherProvider(new FakeClock());
    const a = await weather.getCurrent(place, never);
    const b = await weather.getCurrent(place, never);
    expect(a).toEqual(b);
    const f3 = await weather.getForecast(place, 3, false, never);
    expect(f3.ok && f3.value.length).toBe(3);
    const withToday = await weather.getForecast(place, 3, true, never);
    if (f3.ok && withToday.ok) expect(withToday.value[0]?.date).not.toBe(f3.value[0]?.date);

    const controller = new AbortController();
    const pending = weather.getCurrent(place, controller.signal);
    controller.abort();
    expect((await pending).ok).toBe(false);
  });

  it('createConfig defaults are used when none is given', () => {
    expect(composeDemo({ keyValueStore: new InMemoryKeyValueStore() }).config).toEqual(createConfig());
  });
});

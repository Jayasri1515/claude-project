// @vitest-environment jsdom
/**
 * TASK-038: composed scenario tests for AC-001-1..AC-007-6 and AC-P-01..P-05.
 *
 * Each test drives the real UI, controller and core services (through
 * `compose()`) over the TASK-012 fakes, so it exercises the same wiring the app
 * uses. Every test title starts with the AC ID(s) it covers, so the mapping in
 * impl-plan.md can be checked with a text search.
 *
 * Limits (stated, not hidden): this is jsdom with fakes. It cannot show layout
 * (AC-007-1, AC-007-4: see e2e/layout.spec.ts), how the icons look (they are the
 * Lucide icons of TASK-035: presence, decorative marking and per-condition choice
 * are tested here, the drawing is not), real Geolocation or real localStorage
 * (see e2e/), or any real provider.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { locationDenied, serviceUnavailable, timeoutError } from '../../src/core/errors';
import { FAVORITES_STORAGE_KEY } from '../../src/core/favorites/favoritesService';
import { formatForecastDate, formatLastUpdated } from '../../src/core/format';
import { err, ok } from '../../src/core/result';
import { sampleForecast } from '../fixtures/domain';
import { InMemoryKeyValueStore } from '../fakes';
import { city, isDisabled, renderStack } from '../ui/helpers';
import type { Stack } from '../ui/helpers';

type User = ReturnType<typeof userEvent.setup>;

const region = (name: string) => screen.getByRole('region', { name });
const current = () => region('Current weather');
const forecast = () => region('Forecast');
const favorites = () => region('Favorites');
const values = (): string[] => Array.from(current().querySelectorAll('dd')).map((dd) => dd.textContent ?? '');
const rows = (): HTMLElement[] => within(forecast()).queryAllByRole('listitem');
const lastUpdated = (): string => document.querySelector('.last-updated')?.textContent ?? '';
const refreshButton = () => screen.getByRole('button', { name: 'Refresh' });
const locate = () => screen.getByRole('button', { name: 'Use my location' });

async function search(user: User, text: string): Promise<void> {
  const input = screen.getByLabelText('City name');
  await user.clear(input);
  if (text !== '') await user.type(input, text);
  await user.type(input, '{Enter}');
}

/** Weather answers carry the city's latitude as the temperature, so tests can tell whose data is shown. */
function tagWeatherByCity(t: Stack): void {
  t.weather.currentScript.respondWith((loc) => ok({ temperatureC: loc.latitude, humidityPct: 50, condition: 'CLEAR' }));
}

const oslo = city(1, { name: 'Oslo', admin1: 'Viken', country: 'Norway' });

describe('US-001 City search', () => {
  it('AC-001-1: a valid city and submit show weather for that city (current and forecast)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([oslo]));
    await search(user, 'Oslo');
    expect(await within(current()).findByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
    await waitFor(() => expect(values()).toEqual(['22°C', '60%', 'Partly cloudy']));
    expect(rows()).toHaveLength(3);
    expect(t.geocoding.searchScript.calls[0]?.args[0]).toBe('Oslo');
    expect(t.weather.currentScript.calls[0]?.args[0].key).toBe(oslo.key);
  });

  it('AC-001-2: city name and country are shown when available, and no country when absent', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([oslo]));
    await search(user, 'Oslo');
    expect(await within(current()).findByRole('heading', { name: /Oslo.*Norway/ })).toBeTruthy();
    t.geocoding.searchScript.respondWith(ok([city(2, { name: 'Nowhereland', admin1: undefined, country: undefined })]));
    await search(user, 'Nowhereland');
    const heading = await within(current()).findByRole('heading', { name: 'Nowhereland' });
    expect(heading.textContent).toBe('Nowhereland');
  });

  it('AC-001-3: a city that cannot be found shows a clear message and requests no weather', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([]));
    await search(user, 'Zzyzx');
    expect(await screen.findByText('City not found. Check the spelling and try again.')).toBeTruthy();
    expect(t.weather.currentScript.callCount).toBe(0);
    expect(t.weather.forecastScript.callCount).toBe(0);
  });

  // Three distinct inputs. The text is set on the field directly (typing a tab would move focus). A text
  // field drops newlines when its value is set, so the third case reaches the app as a tab plus a space.
  it.each([
    ['empty', '', ''],
    ['three spaces', '   ', '   '],
    ['a tab, a space and a newline', '\t \n', '\t '],
  ])(
    'AC-001-4 / AC-P-01: empty or whitespace-only submit (%s) prompts for a city and makes zero provider calls',
    async (_label, text, valueInField) => {
      const user = userEvent.setup();
      const t = renderStack();
      const input = screen.getByLabelText<HTMLInputElement>('City name');
      fireEvent.change(input, { target: { value: text } });
      expect(input.value).toBe(valueInField); // the field really holds this whitespace
      await user.type(input, '{Enter}');
      expect(await screen.findByText('Please enter a city name.')).toBeTruthy();
      expect(t.geocoding.searchScript.callCount).toBe(0);
      expect(t.weather.currentScript.callCount).toBe(0);
      expect(t.weather.forecastScript.callCount).toBe(0);
    },
  );

  it('AC-001-5 / EC-005: service unavailable (error result or a port that throws) shows a message and the app keeps working', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await search(user, 'Oslo');
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();

    t.geocoding.searchScript.failWith(new Error('SECRET-PORT-FAILURE'));
    await search(user, 'Oslo');
    await waitFor(() => expect(t.geocoding.searchScript.callCount).toBe(2));
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('SECRET-PORT-FAILURE');

    // Recovery: the page still works.
    t.geocoding.searchScript.respondWith(ok([oslo]));
    await search(user, 'Oslo');
    expect(await within(current()).findByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
  });

  it('FR-007 default: several matches wait for a choice, and the chosen one is shown', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(
      ok([city(1, { name: 'Sam', admin1: 'North', country: 'A' }), city(2, { name: 'Sam', admin1: 'South', country: 'B' })]),
    );
    await search(user, 'Sam');
    expect(await screen.findByText('Several places match. Choose one:')).toBeTruthy();
    expect(t.weather.currentScript.callCount).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Sam, South, B' }));
    expect(await within(current()).findByRole('heading', { name: 'Sam, South, B' })).toBeTruthy();
  });
});

describe('US-002 Device location', () => {
  it('AC-002-1 / AC-002-5: permission already granted: location is detected at launch and its weather is shown', async () => {
    const t = renderStack({ permission: 'granted' });
    t.location.positionScript.respondWith(ok({ lat: 5, lon: 6 }));
    await act(() => t.controller.start());
    expect(t.location.positionScript.callCount).toBe(1);
    expect(await within(current()).findByRole('heading', { name: 'Current location' })).toBeTruthy();
    await waitFor(() => expect(values()).toEqual(['22°C', '60%', 'Partly cloudy']));
    expect(rows()).toHaveLength(3);
  });

  it('AC-002-2: permission not yet granted: nothing asks for the position at launch, only the user action does', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.respondWith(ok({ lat: 5, lon: 6 }));
    await act(() => t.controller.start());
    expect(t.location.positionScript.callCount).toBe(0);
    await user.click(locate());
    expect(t.location.positionScript.callCount).toBe(1);
    expect(await within(current()).findByRole('heading', { name: 'Current location' })).toBeTruthy();
  });

  it('AC-002-3 / EC-007: permission denied: message shown and city search still works', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.respondWith(err(locationDenied()));
    await user.click(locate());
    expect(await screen.findByText(/Location access was denied/)).toBeTruthy();
    t.geocoding.searchScript.respondWith(ok([oslo]));
    await search(user, 'Oslo');
    expect(await within(current()).findByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
  });

  it.each([
    ['times out', timeoutError(), /took too long/],
    ['cannot be determined', { code: 'LOCATION_UNAVAILABLE', messageKey: 'error.locationUnavailable' } as const, /could not be determined/],
  ])('AC-002-4 / EC-008: location %s: helpful message and city search still works', async (_n, error, text) => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.respondWith(err(error));
    await user.click(locate());
    expect(await screen.findByText(text)).toBeTruthy();
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
    t.geocoding.searchScript.respondWith(ok([oslo]));
    await search(user, 'Oslo');
    expect(await within(current()).findByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
  });

  it('EC-009: a device with no location capability reports it and keeps city search', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'unsupported' });
    await act(() => t.controller.start());
    await user.click(locate());
    expect(await screen.findByText(/could not be determined/)).toBeTruthy();
    expect(t.location.positionScript.callCount).toBe(0);
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
  });
});

describe('US-003 Current weather', () => {
  it('AC-003-1 / AC-007-3 / AC-P-04: temperature, humidity and condition are shown with labels and units', async () => {
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    const terms = Array.from(current().querySelectorAll('dt')).map((dt) => dt.textContent);
    expect(terms).toEqual(['Temperature', 'Humidity', 'Condition']);
    expect(values()).toEqual(['22°C', '60%', 'Partly cloudy']);
  });

  it('AC-003-2 / AC-007-2: the condition has descriptive text and a decorative Lucide icon beside it (TASK-035)', async () => {
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    const icon = current().querySelector('svg.weather-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('data-icon-key')).toBe('partly-cloudy');
    expect(icon?.parentElement?.textContent).toContain('Partly cloudy');
  });

  it('AC-003-3: temperature follows the configured unit and the choice persists across a reload', async () => {
    const user = userEvent.setup();
    const kv = new InMemoryKeyValueStore();
    const first = renderStack({ kv });
    await act(() => first.controller.chooseCandidate(oslo));
    await user.click(screen.getByRole('radio', { name: '°F' }));
    await waitFor(() => expect(values()[0]).toBe('71°F'));
    expect(rows()[0]?.textContent).toContain('°F');
    first.unmount();
    const second = renderStack({ kv });
    await act(() => second.controller.start());
    await act(() => second.controller.chooseCandidate(oslo));
    expect(values()[0]).toBe('71°F');
  });

  it('AC-003-4 / EC-010: incomplete data shows the available values and marks the missing one Unavailable (never 0)', async () => {
    const t = renderStack();
    t.weather.currentScript.respondWith(ok({ temperatureC: 0, condition: 'CLEAR' }));
    await act(() => t.controller.chooseCandidate(oslo));
    expect(values()).toEqual(['0°C', 'Unavailable', 'Clear']);
  });

  it('AC-003-5: current-weather failure shows an error with Retry, forecast unaffected; Retry recovers', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.weather.currentScript.respondWith(err(serviceUnavailable()));
    await act(() => t.controller.chooseCandidate(oslo));
    expect(within(current()).getByText(/weather service is unavailable/)).toBeTruthy();
    expect(rows()).toHaveLength(3);
    t.weather.currentScript.respondWith(ok({ temperatureC: 3, humidityPct: 4, condition: 'SNOW' }));
    await user.click(within(current()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(values()).toEqual(['3°C', '4%', 'Snow']));
  });
});

describe('US-004 Three-day forecast', () => {
  it('AC-004-1 / AC-004-2 / AC-004-3: three days, each with date, high and low, condition text and an icon (TASK-035)', async () => {
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    expect(rows()).toHaveLength(3);
    expect(rows()[0]?.textContent).toContain(formatForecastDate('2026-01-02'));
    expect(rows()[0]?.textContent).toContain('High 20°C, Low 10°C');
    expect(rows().map((r) => r.textContent?.match(/Clear|Rain|Cloudy/)?.[0])).toEqual(['Clear', 'Rain', 'Cloudy']);
    expect(rows().every((r) => r.querySelector('svg.weather-icon[aria-hidden="true"]') !== null)).toBe(true);
    // Each row's icon is the one for its own condition (Clear, Rain, Cloudy), and the text is there too.
    expect(rows().map((r) => r.querySelector('svg.weather-icon')?.getAttribute('data-icon-key'))).toEqual(['clear', 'rain', 'cloudy']);
  });

  it('AC-004-4 / EC-011: fewer than three days: available days shown, the rest marked unavailable', async () => {
    const t = renderStack();
    t.weather.forecastScript.respondWith(ok(sampleForecast.slice(0, 1)));
    await act(() => t.controller.chooseCandidate(oslo));
    expect(rows()).toHaveLength(3);
    expect(rows()[0]?.textContent).toContain('Clear');
    expect(rows()[1]?.textContent).toBe('Forecast unavailable for this day');
    expect(rows()[2]?.textContent).toBe('Forecast unavailable for this day');
  });

  it('AC-004-5: forecast failure shows an error and a retry option; current weather stays visible; Retry recovers', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await act(() => t.controller.chooseCandidate(oslo));
    expect(within(forecast()).getByText(/weather service is unavailable/)).toBeTruthy();
    expect(values()[0]).toBe('22°C');
    t.weather.forecastScript.respondWith(ok(sampleForecast));
    await user.click(within(forecast()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(within(forecast()).queryByText(/weather service is unavailable/)).toBeNull();
  });
});

describe('US-005 Manual refresh', () => {
  it('AC-005-1 / AC-005-2 / AC-005-5: Refresh is offered with weather, requests both sections for the same place, and updates values and time', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    await act(() => t.controller.chooseCandidate(oslo));
    const before = lastUpdated();
    expect(before).not.toBe('');
    t.clock.advance(10 * 60_000);
    t.weather.currentScript.respondWith(ok({ temperatureC: 30, humidityPct: 10, condition: 'CLEAR' }));
    t.weather.forecastScript.respondWith(ok(sampleForecast.slice(0, 2)));
    await user.click(refreshButton());
    await waitFor(() => expect(values()[0]).toBe('30°C'));
    await waitFor(() => expect(rows()[2]?.textContent).toBe('Forecast unavailable for this day'));
    expect(t.weather.currentScript.callCount).toBe(2);
    expect(t.weather.forecastScript.callCount).toBe(2);
    expect(t.weather.currentScript.calls[1]?.args[0].key).toBe(oslo.key);
    expect(t.weather.forecastScript.calls[1]?.args[0].key).toBe(oslo.key);
    expect(lastUpdated()).toBe(formatLastUpdated(new Date(t.clock.now())));
    expect(lastUpdated()).not.toBe(before);
  });

  it('AC-005-3 / AC-P-03 / EC-012: five activations during one refresh leave exactly one outstanding request per section', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    for (let i = 0; i < 5; i += 1) await user.click(refreshButton());
    expect(t.weather.currentScript.callCount).toBe(2); // 1 initial + 1 refresh
    expect(t.weather.forecastScript.callCount).toBe(2);
    expect(t.weather.currentScript.pending).toHaveLength(1);
    expect(t.weather.forecastScript.pending).toHaveLength(1);
    expect(isDisabled(refreshButton())).toBe(true);
    await act(async () => {
      t.weather.currentScript.resolveNext(ok({ temperatureC: 1 }));
      t.weather.forecastScript.resolveNext(ok(sampleForecast));
    });
    await waitFor(() => expect(isDisabled(refreshButton())).toBe(false));
  });

  it('AC-005-4 / AC-P-02 / EC-013: a failed refresh keeps the previous values and the previous time next to the error', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    const before = lastUpdated();
    t.clock.advance(10 * 60_000);
    t.weather.currentScript.respondWith(err(serviceUnavailable()));
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await user.click(refreshButton());
    await waitFor(() => expect(within(current()).getByText(/weather service is unavailable/)).toBeTruthy());
    expect(values()).toEqual(['22°C', '60%', 'Partly cloudy']);
    expect(rows()).toHaveLength(3);
    expect(lastUpdated()).toBe(before);
  });

  it('partial refresh failure: the failed section keeps its old data and old time; the other section updates', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    t.clock.advance(10 * 60_000);
    t.weather.currentScript.respondWith(ok({ temperatureC: 40, humidityPct: 1, condition: 'FOG' }));
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await user.click(refreshButton());
    await waitFor(() => expect(values()[0]).toBe('40°C'));
    expect(within(forecast()).getByText(/weather service is unavailable/)).toBeTruthy();
    expect(rows()).toHaveLength(3);
    expect(within(forecast()).getByText(/Showing data from/)).toBeTruthy();
    // The shared last-updated time is the older one: the forecast's earlier success.
    expect(lastUpdated()).toBe(formatLastUpdated(new Date('2026-01-01T12:00:00Z')));
  });
});

describe('US-006 Favorites', () => {
  it('AC-006-1 / AC-006-2: Add saves the shown city and the favorites list shows it', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(await within(favorites()).findByRole('button', { name: 'Oslo, Viken, Norway Showing' })).toBeTruthy();
  });

  it('AC-006-3: selecting a favorite shows its current weather and forecast, without a name search', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    tagWeatherByCity(t);
    const other = city(2, { name: 'Bergen', admin1: 'Vestland', country: 'Norway' });
    await act(() => t.controller.chooseCandidate(oslo));
    await act(() => t.controller.addFavorite());
    await act(() => t.controller.chooseCandidate(other));
    await user.click(screen.getByRole('button', { name: 'Show weather for Oslo, Viken, Norway' }));
    expect(await within(current()).findByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
    await waitFor(() => expect(values()[0]).toBe('1°C'));
    expect(rows()).toHaveLength(3);
    expect(t.geocoding.searchScript.callCount).toBe(0);
  });

  it('AC-006-4 / EC-014: an existing favorite cannot be added again', async () => {
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    await act(() => t.controller.addFavorite());
    await act(() => t.controller.addFavorite());
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    expect(JSON.parse(t.kv.data.get(FAVORITES_STORAGE_KEY) ?? '{}').favorites).toHaveLength(1);
    expect(within(favorites()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('AC-006-5 / EC-015: removing a favorite removes it; removing the displayed one keeps the weather on screen', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(oslo));
    await act(() => t.controller.addFavorite());
    await user.click(screen.getByRole('button', { name: 'Remove Oslo, Viken, Norway from favorites' }));
    await waitFor(() => expect(within(favorites()).getByText('No favorites yet.')).toBeTruthy());
    expect(within(current()).getByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
    expect(values()[0]).toBe('22°C');
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeTruthy();
  });

  it('AC-006-6 / AC-P-05: a favorite added in one session is present after a reload (new app over the same storage)', async () => {
    const kv = new InMemoryKeyValueStore();
    const first = renderStack({ kv });
    await act(() => first.controller.chooseCandidate(oslo));
    await act(() => first.controller.addFavorite());
    first.unmount();
    const second = renderStack({ kv });
    await act(() => second.controller.start());
    expect(within(favorites()).getByRole('button', { name: 'Show weather for Oslo, Viken, Norway' })).toBeTruthy();
  });

  it('EC-016: storage that cannot be read or written shows a non-blocking notice and the session still works', async () => {
    const user = userEvent.setup();
    const kv = new InMemoryKeyValueStore();
    kv.failAll();
    const t = renderStack({ kv });
    await act(() => t.controller.start());
    expect(await within(favorites()).findByText('Favorites may not be saved on this device.')).toBeTruthy();
    await act(() => t.controller.chooseCandidate(oslo));
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(await within(favorites()).findByRole('button', { name: 'Oslo, Viken, Norway Showing' })).toBeTruthy();
    expect(values()[0]).toBe('22°C');
  });
});

describe('US-007 Interface', () => {
  it('AC-007-1 / AC-007-6 (structure only): banner, navigation, main, and four labelled sections in one order; every nav link reaches a section heading', () => {
    renderStack();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    const names = within(screen.getByRole('main')).getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'));
    expect(names).toHaveLength(4);
    const links = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Search', 'Current weather', 'Forecast', 'Favorites']);
    for (const link of links) {
      const target = document.getElementById((link.getAttribute('href') ?? '').slice(1));
      expect(target?.tagName).toBe('H2');
    }
  });

  it('AC-007-5: a loading indicator is shown while data loads, then replaced; an unavailable service shows an error state', async () => {
    const t = renderStack();
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    act(() => {
      void t.controller.chooseCandidate(oslo);
    });
    expect(within(region('Status')).getByText('Loading weather...')).toBeTruthy();
    expect(within(current()).getByText('Loading...')).toBeTruthy();
    await act(async () => {
      t.weather.currentScript.resolveNext(err(serviceUnavailable()));
      t.weather.forecastScript.resolveNext(ok(sampleForecast));
    });
    expect(within(region('Status')).queryByText('Loading weather...')).toBeNull();
    expect(within(current()).getByText(/weather service is unavailable/)).toBeTruthy();
    expect(current().querySelector('dl')).toBeNull(); // no misleading values
  });
});

describe('Races (F-001, F-007, NFR-001)', () => {
  it('a device-location lookup that is still outstanding when a city search is made is cancelled and its result never shown', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'granted' });
    tagWeatherByCity(t);
    t.location.positionScript.hold();
    await user.click(locate());
    await waitFor(() => expect(t.location.positionScript.pending).toHaveLength(1)); // the lookup is outstanding
    const lookup = t.location.positionScript.pending[0];
    expect(lookup?.aborted).toBe(false);
    t.geocoding.searchScript.respondWith(ok([oslo]));
    await search(user, 'Oslo');
    expect(await within(current()).findByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
    // The search cancelled the lookup (the port contract: an aborted call settles as ABORTED).
    expect(lookup?.aborted).toBe(true);
    expect(lookup?.settled).toBe(true);
    await act(async () => {
      lookup?.resolve(ok({ lat: 77, lon: 88 })); // ignored: the call is already settled
    });
    expect(within(current()).getByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
    await waitFor(() => expect(values()[0]).toBe('1°C'));
    expect(screen.queryByRole('heading', { name: 'Current location' })).toBeNull();
    expect(t.weather.currentScript.calls.some((c) => c.args[0].latitude === 77)).toBe(false);
  });

  it('a slow device-location result from a port that ignores the cancellation is still discarded when it arrives after a city search', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'granted' });
    tagWeatherByCity(t);
    // A position lookup that does not honour the abort signal and answers only when the test says so.
    let answerLate!: (value: Awaited<ReturnType<typeof t.location.getCurrentPosition>>) => void;
    let lookups = 0;
    t.location.getCurrentPosition = () => {
      lookups += 1;
      return new Promise((resolve) => {
        answerLate = resolve;
      });
    };
    await user.click(locate());
    await waitFor(() => expect(lookups).toBe(1)); // the lookup is outstanding (answerLate is its resolver)
    t.geocoding.searchScript.respondWith(ok([oslo]));
    await search(user, 'Oslo');
    expect(await within(current()).findByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
    await waitFor(() => expect(values()[0]).toBe('1°C'));
    await act(async () => {
      answerLate(ok({ lat: 77, lon: 88 }));
    });
    expect(within(current()).getByRole('heading', { name: 'Oslo, Viken, Norway' })).toBeTruthy();
    expect(values()[0]).toBe('1°C');
    expect(screen.queryByRole('heading', { name: 'Current location' })).toBeNull();
    expect(t.weather.currentScript.calls.some((c) => c.args[0].latitude === 77)).toBe(false);
  });

  it('slow weather for city A that arrives after city B was selected is discarded', async () => {
    const t = renderStack();
    tagWeatherByCity(t);
    const a = city(10, { name: 'Alpha', admin1: 'R', country: 'L' });
    const b = city(20, { name: 'Beta', admin1: 'R', country: 'L' });
    t.weather.currentScript.hold();
    act(() => {
      void t.controller.chooseCandidate(a);
    });
    await waitFor(() => expect(t.weather.currentScript.pending).toHaveLength(1)); // A's request is outstanding
    expect(t.weather.currentScript.pending[0]?.args[0].name).toBe('Alpha');
    t.weather.currentScript.release();
    await act(() => t.controller.chooseCandidate(b));
    expect(t.weather.currentScript.pending.map((c) => c.args[0].name)).toEqual(['Alpha']); // still only A's
    await act(async () => {
      t.weather.currentScript.pending.forEach((c) => c.resolve(ok({ temperatureC: 99, humidityPct: 99, condition: 'FOG' })));
    });
    expect(t.weather.currentScript.pending).toHaveLength(0); // A's late answer (99) was delivered and ignored
    expect(within(current()).getByRole('heading', { name: 'Beta, R, L' })).toBeTruthy();
    expect(values()[0]).toBe('20°C');
    expect(current().textContent).not.toContain('99');
  });
});

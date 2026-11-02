// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ForecastDay, WeatherSnapshot } from '../../src/core/domain';
import { invalidResponse, networkError, serviceUnavailable } from '../../src/core/errors';
import { formatForecastDate } from '../../src/core/format';
import { createConfig } from '../../src/core/config';
import { sampleCurrent, sampleForecast, sampleSnapshot } from '../fixtures/domain';
import { renderWithFakeController } from './helpers';

const updatedAt = new Date('2026-01-01T12:00:00Z');
const withForecast = (forecast: WeatherSnapshot['forecast']): WeatherSnapshot => ({ ...sampleSnapshot, forecast });
const readyDays = (days: ForecastDay[]) => withForecast({ status: 'ready', data: days, updatedAt });
const region = () => screen.getByRole('region', { name: 'Forecast' });
const rows = (): HTMLElement[] => within(region()).queryAllByRole('listitem');

describe('Forecast list (TASK-029)', () => {
  it('shows three days with date, condition text, and labeled high and low', () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    expect(rows()).toHaveLength(3);
    const first = rows()[0];
    expect(first?.textContent).toContain(formatForecastDate('2026-01-02'));
    expect(first?.textContent).toContain('Sunny'); // forecast days always use the day wording (M-44)
    expect(first?.textContent).toContain('High 20°C, Low 10°C');
    expect(rows()[1]?.textContent).toContain('Rain');
    expect(rows()[2]?.textContent).toContain('Cloudy');
  });

  it('labels only the first day "Today" (M-30), beside its date', () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    const labels = rows().map((row) => row.querySelector('.forecast-today')?.textContent ?? null);
    expect(labels).toEqual(['Today', null, null]);
    expect(rows()[0]?.querySelector('.forecast-date')?.textContent).toBe(formatForecastDate('2026-01-02'));
    expect(region().textContent?.match(/Today/g)).toHaveLength(1);
  });

  it('has no "Today" label when the forecast does not start with today (Config.forecastIncludesToday false)', () => {
    renderWithFakeController({ snapshot: sampleSnapshot }, createConfig({ forecastIncludesToday: false }));
    expect(region().textContent).not.toContain('Today');
  });

  it('has no "Today" label on an unavailable row', () => {
    renderWithFakeController({ snapshot: readyDays([]) });
    expect(region().textContent).not.toContain('Today');
  });

  it('a clear forecast day reads Sunny with a decorative sun icon, even if the current card is at night', () => {
    renderWithFakeController({
      snapshot: {
        ...sampleSnapshot,
        current: { ...sampleSnapshot.current, data: { ...sampleCurrent, condition: 'CLEAR', isDay: false } },
      },
    });
    const icon = rows()[0]?.querySelector('svg.weather-icon');
    expect(icon?.classList.contains('lucide-sun')).toBe(true);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows a drizzle day with the Drizzle text and its icon', () => {
    renderWithFakeController({ snapshot: readyDays([{ date: '2026-01-02', condition: 'DRIZZLE' }]) });
    expect(rows()[0]?.textContent).toContain('Drizzle');
    expect(rows()[0]?.querySelector('svg')?.classList.contains('lucide-cloud-drizzle')).toBe(true);
  });

  it('shows temperatures in Fahrenheit with the unit when selected', () => {
    renderWithFakeController({ snapshot: sampleSnapshot, temperatureUnit: 'F' });
    expect(rows()[0]?.textContent).toContain('High 68°F, Low 50°F');
  });

  it('two days supplied: shows two days then one unavailable row', () => {
    renderWithFakeController({ snapshot: readyDays(sampleForecast.slice(0, 2)) });
    expect(rows()).toHaveLength(3);
    expect(rows()[2]?.textContent).toBe('Unavailable');
    expect(rows()[1]?.textContent).toContain('Rain');
  });

  it('no days supplied: three unavailable rows, no invented values', () => {
    renderWithFakeController({ snapshot: readyDays([]) });
    expect(rows().map((row) => row.textContent)).toEqual(Array(3).fill('Unavailable'));
  });

  it('more days than configured are not shown', () => {
    const extra: ForecastDay = { date: '2026-01-05', tempMinC: 1, tempMaxC: 2, condition: 'SNOW' };
    renderWithFakeController({ snapshot: readyDays([...sampleForecast, extra]) });
    expect(rows()).toHaveLength(3);
    expect(region().textContent).not.toContain('Snow');
  });

  it('a day with missing temperatures shows Unavailable for them', () => {
    renderWithFakeController({ snapshot: readyDays([{ date: '2026-01-02', condition: 'FOG' }]) });
    expect(rows()[0]?.textContent).toContain('High Unavailable, Low Unavailable');
  });

  it('error with no data shows the message and a retry, and no rows', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController({
      snapshot: withForecast({ status: 'error', error: serviceUnavailable() }),
    });
    expect(rows()).toHaveLength(0);
    expect(within(region()).getByText(/weather service is unavailable/)).toBeTruthy();
    await user.click(within(region()).getByRole('button', { name: 'Retry' }));
    expect(controller.refresh).toHaveBeenCalledTimes(1);
  });

  it('error with previous data keeps the rows and says they may be out of date (M-27)', () => {
    renderWithFakeController({
      snapshot: withForecast({ status: 'error', error: serviceUnavailable(), data: sampleForecast, updatedAt }),
    });
    expect(rows()).toHaveLength(3);
    expect(within(region()).getByText('Could not refresh. The weather shown may be out of date.')).toBeTruthy();
    expect(within(region()).getByText(/weather service is unavailable/)).toBeTruthy();
  });

  it('an unreadable forecast section with the current weather fine shows M-26 and a retry', () => {
    renderWithFakeController({ snapshot: withForecast({ status: 'error', error: invalidResponse() }) });
    expect(within(region()).getByText('The forecast could not be loaded. Please try again.')).toBeTruthy();
    expect(within(region()).queryByText(/Could not refresh/)).toBeNull();
    expect(within(region()).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('an unreadable forecast kept from earlier shows M-27 with M-26', () => {
    renderWithFakeController({
      snapshot: withForecast({ status: 'error', error: invalidResponse(), data: sampleForecast, updatedAt }),
    });
    expect(rows()).toHaveLength(3);
    expect(within(region()).getByText('Could not refresh. The weather shown may be out of date.')).toBeTruthy();
    expect(within(region()).getByText('The forecast could not be loaded. Please try again.')).toBeTruthy();
  });

  it('a whole failure shows each section the kind message (M-06 for an unreadable response), not M-26', () => {
    renderWithFakeController({
      snapshot: {
        ...sampleSnapshot,
        current: { status: 'error', error: invalidResponse() },
        forecast: { status: 'error', error: invalidResponse() },
      },
    });
    expect(within(region()).getByText(/sent a response this app could not read/)).toBeTruthy();
    expect(within(region()).queryByText(/forecast could not be loaded/)).toBeNull();
  });

  it('a network failure of one section shows the network message (M-04)', () => {
    renderWithFakeController({ snapshot: withForecast({ status: 'error', error: networkError() }) });
    expect(within(region()).getByText(/Could not connect to the weather service/)).toBeTruthy();
  });

  it('a failing forecast does not hide the current weather', () => {
    renderWithFakeController({ snapshot: withForecast({ status: 'error', error: serviceUnavailable() }) });
    expect(within(screen.getByRole('region', { name: 'Current weather' })).getByText('22°C')).toBeTruthy();
  });

  it('shows a loading state before data arrives', () => {
    renderWithFakeController({ snapshot: withForecast({ status: 'loading' }) });
    expect(within(region()).getByText('Loading...')).toBeTruthy();
    expect(rows()).toHaveLength(0);
  });
});

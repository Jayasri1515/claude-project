// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ForecastDay, WeatherSnapshot } from '../../src/core/domain';
import { serviceUnavailable } from '../../src/core/errors';
import { formatDataFrom, formatForecastDate } from '../../src/core/format';
import { sampleForecast, sampleSnapshot } from '../fixtures/domain';
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
    expect(first?.textContent).toContain('Clear');
    expect(first?.textContent).toContain('High 20°C, Low 10°C');
    expect(rows()[1]?.textContent).toContain('Rain');
    expect(rows()[2]?.textContent).toContain('Cloudy');
  });

  it('shows temperatures in Fahrenheit with the unit when selected', () => {
    renderWithFakeController({ snapshot: sampleSnapshot, temperatureUnit: 'F' });
    expect(rows()[0]?.textContent).toContain('High 68°F, Low 50°F');
  });

  it('two days supplied: shows two days then one unavailable row', () => {
    renderWithFakeController({ snapshot: readyDays(sampleForecast.slice(0, 2)) });
    expect(rows()).toHaveLength(3);
    expect(rows()[2]?.textContent).toBe('Forecast unavailable for this day');
    expect(rows()[1]?.textContent).toContain('Rain');
  });

  it('no days supplied: three unavailable rows, no invented values', () => {
    renderWithFakeController({ snapshot: readyDays([]) });
    expect(rows().map((row) => row.textContent)).toEqual(Array(3).fill('Forecast unavailable for this day'));
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

  it('error with previous data keeps the rows and shows when they are from', () => {
    renderWithFakeController({
      snapshot: withForecast({ status: 'error', error: serviceUnavailable(), data: sampleForecast, updatedAt }),
    });
    expect(rows()).toHaveLength(3);
    expect(within(region()).getByText(formatDataFrom(updatedAt))).toBeTruthy();
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

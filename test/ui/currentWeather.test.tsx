// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CurrentWeather, WeatherSnapshot } from '../../src/core/domain';
import { serviceUnavailable } from '../../src/core/errors';
import { formatDataFrom } from '../../src/core/format';
import { sampleCurrent, sampleSnapshot } from '../fixtures/domain';
import { renderWithFakeController } from './helpers';

const snapshotWith = (current: WeatherSnapshot['current']): WeatherSnapshot => ({ ...sampleSnapshot, current });
const card = () => screen.getByRole('region', { name: 'Current weather' });
const values = (): string[] => Array.from(card().querySelectorAll('dd')).map((dd) => dd.textContent ?? '');
const readyWith = (data: CurrentWeather) => snapshotWith({ status: 'ready', data, updatedAt: new Date('2026-01-01T12:00:00Z') });

describe('Current weather card (TASK-028)', () => {
  it('shows city, country, and every value with its label and unit', () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    expect(within(card()).getByRole('heading', { name: 'Testville, Testshire, Testland' })).toBeTruthy();
    const terms = Array.from(card().querySelectorAll('dt')).map((dt) => dt.textContent);
    expect(terms).toEqual(['Temperature', 'Humidity', 'Condition']);
    expect(values()).toEqual(['22°C', '60%', 'Partly cloudy']);
  });

  it('places a decorative icon beside the condition text, never alone', () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    const icon = card().querySelector('svg.weather-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('role')).toBeNull();
    expect(icon?.getAttribute('data-icon-key')).toBe('partly-cloudy');
    expect(icon?.classList.contains('lucide-cloud-sun')).toBe(true); // the Lucide "cloud-sun" drawing
    expect(icon?.parentElement?.textContent).toContain('Partly cloudy');
  });

  it.each([
    ['temperature', { ...sampleCurrent, temperatureC: undefined }, ['Unavailable', '60%', 'Partly cloudy']],
    ['humidity', { ...sampleCurrent, humidityPct: undefined }, ['22°C', 'Unavailable', 'Partly cloudy']],
    [
      'condition',
      { temperatureC: 21.5, humidityPct: 60 } satisfies CurrentWeather,
      ['22°C', '60%', 'Unavailable'],
    ],
  ])('a missing %s reads "Unavailable", never 0 or blank', (_name, data, expected) => {
    renderWithFakeController({ snapshot: readyWith(data) });
    expect(values()).toEqual(expected);
  });

  it('shows 0 for a real zero reading, distinct from unavailable', () => {
    renderWithFakeController({ snapshot: readyWith({ temperatureC: 0, humidityPct: 0, condition: 'CLEAR' }) });
    expect(values()).toEqual(['0°C', '0%', 'Clear']);
  });

  it('uses provider text for an unknown condition', () => {
    renderWithFakeController({
      snapshot: readyWith({ temperatureC: 1, humidityPct: 2, condition: 'UNKNOWN', conditionText: 'Dust devils' }),
    });
    expect(values()[2]).toBe('Dust devils');
  });

  it('shows Fahrenheit with its unit when selected', () => {
    renderWithFakeController({ snapshot: sampleSnapshot, temperatureUnit: 'F' });
    expect(values()[0]).toBe('71°F');
  });

  it('shows a loading state when no data has arrived yet', () => {
    renderWithFakeController({ snapshot: snapshotWith({ status: 'loading' }) });
    expect(within(card()).getByText('Loading...')).toBeTruthy();
    expect(card().querySelector('dl')).toBeNull();
  });

  it('a failed section with no data shows its error and a retry that asks the controller to refresh', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController({
      snapshot: snapshotWith({ status: 'error', error: serviceUnavailable() }),
    });
    expect(within(card()).getByText(/weather service is unavailable/)).toBeTruthy();
    expect(card().querySelector('dl')).toBeNull();
    await user.click(within(card()).getByRole('button', { name: 'Retry' }));
    expect(controller.refresh).toHaveBeenCalledTimes(1);
  });

  it('a failed section keeps its previous values and says when they are from', () => {
    const updatedAt = new Date('2026-01-01T12:00:00Z');
    renderWithFakeController({
      snapshot: snapshotWith({ status: 'error', error: serviceUnavailable(), data: sampleCurrent, updatedAt }),
    });
    expect(values()).toEqual(['22°C', '60%', 'Partly cloudy']);
    expect(within(card()).getByText(/weather service is unavailable/)).toBeTruthy();
    expect(within(card()).getByText(formatDataFrom(updatedAt))).toBeTruthy();
  });

  it('keeps showing values while a refresh is in progress', () => {
    renderWithFakeController({
      snapshot: snapshotWith({ status: 'loading', data: sampleCurrent, updatedAt: new Date('2026-01-01T12:00:00Z') }),
    });
    expect(values()[0]).toBe('22°C');
    expect(within(card()).getByText('Updating...')).toBeTruthy();
  });

  it('renders provider-supplied text as text, never as markup', () => {
    renderWithFakeController({
      snapshot: {
        ...readyWith({ temperatureC: 1, condition: 'UNKNOWN', conditionText: '<img src=x onerror=alert(1)>' }),
        location: { ...sampleSnapshot.location, name: '<b>Bold</b>' },
      },
    });
    expect(card().querySelector('img')).toBeNull();
    expect(card().querySelector('b')).toBeNull();
    expect(card().textContent).toContain('<b>Bold</b>');
  });
});

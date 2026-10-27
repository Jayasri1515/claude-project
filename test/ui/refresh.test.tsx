// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { serviceUnavailable } from '../../src/core/errors';
import { formatLastUpdated } from '../../src/core/format';
import { err, ok } from '../../src/core/result';
import { sampleForecast, sampleSnapshot } from '../fixtures/domain';
import { city, isDisabled, renderStack, renderWithFakeController } from './helpers';

const refreshButton = () => screen.getByRole('button', { name: 'Refresh' });
const lastUpdated = (): string => document.querySelector('.last-updated')?.textContent ?? '';

describe('Refresh control and last-updated text (TASK-030)', () => {
  it('is hidden until weather is displayed', () => {
    renderWithFakeController();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('is visible with weather and shows the last-updated time', () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    expect(refreshButton()).toBeTruthy();
    expect(lastUpdated()).toBe(formatLastUpdated(new Date('2026-01-01T12:00:05Z')));
  });

  it('shows the older of the two section times', () => {
    renderWithFakeController({
      snapshot: {
        ...sampleSnapshot,
        current: { ...sampleSnapshot.current, updatedAt: new Date('2026-01-01T12:30:00Z') },
        forecast: { ...sampleSnapshot.forecast, updatedAt: new Date('2026-01-01T12:10:00Z') },
      },
    });
    expect(lastUpdated()).toBe(formatLastUpdated(new Date('2026-01-01T12:10:00Z')));
  });

  it('shows no time when a section has never succeeded', () => {
    renderWithFakeController({
      snapshot: { ...sampleSnapshot, forecast: { status: 'error', error: serviceUnavailable() } },
    });
    expect(document.querySelector('.last-updated')).toBeNull();
  });

  it('is unavailable (aria-disabled, still focusable) while a section is loading', () => {
    renderWithFakeController({
      snapshot: { ...sampleSnapshot, current: { ...sampleSnapshot.current, status: 'loading' } },
    });
    expect(isDisabled(refreshButton())).toBe(true);
  });

  it('five rapid activations produce one controller call while it is pending', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController({ snapshot: sampleSnapshot });
    let finish!: () => void;
    controller.refresh.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    for (let i = 0; i < 5; i += 1) await user.click(refreshButton());
    expect(controller.refresh).toHaveBeenCalledTimes(1);
    expect(isDisabled(refreshButton())).toBe(true);
    await act(async () => {
      finish();
    });
    expect(isDisabled(refreshButton())).toBe(false);
  });

  it('with the real controller, five activations cause one provider call per section (AC-P-03)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(city(1)));
    expect(t.weather.currentScript.callCount).toBe(1);
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    for (let i = 0; i < 5; i += 1) await user.click(refreshButton());
    expect(t.weather.currentScript.callCount).toBe(2);
    expect(t.weather.forecastScript.callCount).toBe(2);
    expect(isDisabled(refreshButton())).toBe(true);
    await act(async () => {
      t.weather.currentScript.resolveNext(ok({ temperatureC: 5 }));
      t.weather.forecastScript.resolveNext(ok(sampleForecast));
    });
    await waitFor(() => expect(isDisabled(refreshButton())).toBe(false));
  });

  it('a successful refresh updates the values and the time', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(city(1)));
    const before = lastUpdated();
    t.clock.advance(5 * 60_000);
    t.weather.currentScript.respondWith(ok({ temperatureC: 30, humidityPct: 10, condition: 'CLEAR' }));
    await user.click(refreshButton());
    const current = screen.getByRole('region', { name: 'Current weather' });
    await waitFor(() => expect(within(current).getByText('30°C')).toBeTruthy());
    expect(lastUpdated()).not.toBe(before);
  });

  it('a failed refresh keeps the values and the previous time visible with the error (AC-P-02)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(city(1)));
    const before = lastUpdated();
    expect(before).not.toBe('');
    t.clock.advance(5 * 60_000);
    t.weather.currentScript.respondWith(err(serviceUnavailable()));
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await user.click(refreshButton());
    const current = screen.getByRole('region', { name: 'Current weather' });
    await waitFor(() => expect(within(current).getByText(/weather service is unavailable/)).toBeTruthy());
    expect(within(current).getByText('22°C')).toBeTruthy();
    expect(lastUpdated()).toBe(before);
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    expect(within(forecast).getAllByRole('listitem')).toHaveLength(3);
    expect(isDisabled(refreshButton())).toBe(false);
  });
});

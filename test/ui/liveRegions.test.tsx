// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { serviceUnavailable } from '../../src/core/errors';
import { err, ok } from '../../src/core/result';
import { sampleSnapshot } from '../fixtures/domain';
import { city, renderStack, renderWithFakeController } from './helpers';

/**
 * Live regions (FR-044, review finding M3) and idle section states (M5).
 * One visible source and one announced source per message: no text may be
 * rendered twice, and no live region may sit inside another.
 */
const A = city(1, { name: 'Alpha', admin1: 'Region A', country: 'Land A' });
const B = city(2, { name: 'Beta', admin1: 'Region B', country: 'Land B' });

const liveAncestors = (element: Element): Element[] => {
  const found: Element[] = [];
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (node.getAttribute('aria-live') !== null || node.getAttribute('role') === 'alert') found.push(node);
  }
  return found;
};

describe('one announced source for loading text', () => {
  it('"Searching..." is rendered exactly once, in the status area', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.hold();
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    const matches = screen.getAllByText('Searching...');
    expect(matches).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Status' })).getByText('Searching...')).toBeTruthy();
  });

  it('"Finding your location..." is rendered exactly once, in the status area', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.hold();
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getAllByText('Finding your location...')).toHaveLength(1);
  });
});

describe('errors are announced from one live region each', () => {
  it('section errors sit in a live region that was already in the page before the error', async () => {
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    const current = screen.getByRole('region', { name: 'Current weather' });
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    const currentLive = current.querySelector('.section-status');
    const forecastLive = forecast.querySelector('.section-status');
    expect(currentLive?.getAttribute('aria-live')).toBe('polite');
    expect(forecastLive?.getAttribute('aria-live')).toBe('polite');

    t.weather.currentScript.respondWith(err(serviceUnavailable()));
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await act(() => t.controller.refresh());

    const currentText = within(current).getByText(/weather service is unavailable/);
    const forecastText = within(forecast).getByText(/weather service is unavailable/);
    expect(current.querySelector('.section-status')).toBe(currentLive);
    expect(forecast.querySelector('.section-status')).toBe(forecastLive);
    expect(liveAncestors(currentText)).toEqual([currentLive]);
    expect(liveAncestors(forecastText)).toEqual([forecastLive]);
  });

  it('the Retry button is outside the live region (its label is not re-announced)', () => {
    renderWithFakeController({
      snapshot: { ...sampleSnapshot, current: { status: 'error', error: serviceUnavailable() } },
    });
    const retry = within(screen.getByRole('region', { name: 'Current weather' })).getByRole('button', { name: 'Retry' });
    expect(liveAncestors(retry)).toEqual([]);
  });

  it('search and location errors are each in exactly one live region', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const searchError = await screen.findByText('Please enter a city name.');
    expect(liveAncestors(searchError)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    const locationError = await screen.findByText(/could not be determined/);
    expect(liveAncestors(locationError)).toHaveLength(1);
    expect(t.location.positionScript.callCount).toBe(1);
  });

  it('the candidate chooser is a labelled group, not a live region (focus announces it once)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    const group = await screen.findByRole('group', { name: 'Several places match. Choose one:' });
    expect(liveAncestors(group)).toEqual([]);
    expect(within(group).getAllByRole('button')).toHaveLength(2);
  });
});

describe('idle sections with no data show a defined state (M5)', () => {
  const idle = { status: 'idle' } as const;

  it('current weather says it has not loaded and points at Refresh', () => {
    renderWithFakeController({ snapshot: { ...sampleSnapshot, current: idle } });
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(within(current).getByText('Current weather has not loaded yet. Use Refresh to try again.')).toBeTruthy();
    expect(current.querySelector('dl')).toBeNull();
  });

  it('forecast says it has not loaded and shows no rows', () => {
    renderWithFakeController({ snapshot: { ...sampleSnapshot, forecast: idle } });
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    expect(within(forecast).getByText('The forecast has not loaded yet. Use Refresh to try again.')).toBeTruthy();
    expect(within(forecast).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('a section that has data, is loading or failed does not show the idle text', () => {
    renderWithFakeController({
      snapshot: {
        ...sampleSnapshot,
        current: { status: 'loading' },
        forecast: { status: 'error', error: serviceUnavailable() },
      },
    });
    expect(screen.queryByText(/has not loaded yet/)).toBeNull();
  });
});

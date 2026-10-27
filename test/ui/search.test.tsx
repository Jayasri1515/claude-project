// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { serviceUnavailable } from '../../src/core/errors';
import { err, ok } from '../../src/core/result';
import { act } from '@testing-library/react';
import { city, isDisabled, renderStack, renderWithFakeController } from './helpers';

const A = city(1, { name: 'Alpha', admin1: 'Region A', country: 'Land A' });
const B = city(2, { name: 'Alpha', admin1: 'Region B', country: 'Land B' });

describe('Search UI (TASK-027)', () => {
  it('associates a visible label with the input', () => {
    renderWithFakeController();
    const input = screen.getByLabelText('City name');
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByRole('search')).toBeTruthy();
  });

  it('submitting with the keyboard sends the text as typed', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    await user.type(screen.getByLabelText('City name'), '  São Paulo {Enter}');
    expect(controller.searchCity).toHaveBeenCalledTimes(1);
    expect(controller.searchCity).toHaveBeenCalledWith('  São Paulo ');
  });

  it('the button submits too', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(controller.searchCity).toHaveBeenCalledWith('Oslo');
  });

  it.each(['', '   '])('empty or whitespace submit (%j) shows the prompt and makes no provider request', async (text) => {
    const user = userEvent.setup();
    const t = renderStack();
    if (text !== '') await user.type(screen.getByLabelText('City name'), text);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Please enter a city name.')).toBeTruthy();
    expect(t.geocoding.searchScript.callCount).toBe(0);
    expect(t.weather.currentScript.callCount).toBe(0);
    expect(t.weather.forecastScript.callCount).toBe(0);
  });

  it('shows "city not found" and leaves the app usable', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([]));
    await user.type(screen.getByLabelText('City name'), 'Nowhere');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/City not found/)).toBeTruthy();
    expect(screen.getByLabelText('City name')).toBeTruthy();
    expect(t.weather.currentScript.callCount).toBe(0);
  });

  it('shows a service error message without crashing', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('a provider that rejects shows the same safe message and none of its detail', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.failWith(new Error('SECRET https://example.invalid/?key=abc'));
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('SECRET');
    expect(document.body.textContent).not.toContain('example.invalid');
  });

  it('one match is selected and its weather shown, with the country', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A]));
    await user.type(screen.getByLabelText('City name'), 'Alpha');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    await waitFor(() => expect(within(current).getByText('22°C')).toBeTruthy());
  });

  it('several matches are offered for choice with name, region and country; choosing loads that one', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await user.type(screen.getByLabelText('City name'), 'Alpha');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Several places match. Choose one:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    expect(t.weather.currentScript.callCount).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Alpha, Region B, Land B' }));
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region B, Land B' })).toBeTruthy();
    expect(screen.queryByText('Several places match. Choose one:')).toBeNull();
  });

  it('shows the country only when present', async () => {
    const user = userEvent.setup();
    const noCountry = city(3, { name: 'Gamma' });
    delete (noCountry as { country?: string }).country;
    delete (noCountry as { admin1?: string }).admin1;
    const withRegionOnly = city(4, { name: 'Gamma', admin1: 'Region Z' });
    delete (withRegionOnly as { country?: string }).country;
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([noCountry, withRegionOnly]));
    await user.type(screen.getByLabelText('City name'), 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('button', { name: 'Gamma' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gamma, Region Z' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('over-long input is rejected by the core with no provider request', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await user.click(screen.getByLabelText('City name'));
    await user.paste('x'.repeat(t.config.maxInputLength + 1));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    // C2: its own message, not the 'City not found' one.
    expect(await screen.findByText('That search is too long. Please enter a shorter city name.')).toBeTruthy();
    expect(screen.queryByText(/City not found/)).toBeNull();
    expect(t.geocoding.searchScript.callCount).toBe(0);
  });

  // Review M1: a pending search must not block a corrected query.
  it('a pending search does not block submitting a corrected query; the latest wins', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.hold();
    const input = screen.getByLabelText('City name');
    await user.type(input, 'Alhpa{Enter}');
    expect(t.geocoding.searchScript.callCount).toBe(1);

    const submit = screen.getByRole('button', { name: 'Search' });
    expect(isDisabled(submit)).toBe(false);
    await user.clear(input);
    await user.type(input, 'Alpha{Enter}');
    expect(t.geocoding.searchScript.callCount).toBe(2);
    expect(t.geocoding.searchScript.calls[0]?.aborted).toBe(true);

    await act(async () => {
      t.geocoding.searchScript.calls[1]?.resolve(ok([A]));
      t.geocoding.searchScript.calls[0]?.resolve(ok([B]));
    });
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    expect(within(current).queryByRole('heading', { name: 'Alpha, Region B, Land B' })).toBeNull();
  });

  it('the Search button is never disabled, not even while a search is pending', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.hold();
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    const submit = screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute('aria-disabled')).toBeNull();
  });
});

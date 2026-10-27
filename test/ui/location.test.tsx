// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { locationDenied, locationUnavailable, timeoutError } from '../../src/core/errors';
import { err, ok } from '../../src/core/result';
import { message } from '../../src/core/messages';
import { city, isDisabled, renderStack, renderWithFakeController } from './helpers';

const control = () => screen.getByRole('button', { name: 'Use my location' });

describe('"Use my location" control (TASK-032)', () => {
  it('is prominent, with a short disclosure linked to the button', () => {
    renderWithFakeController();
    const describedBy = control().getAttribute('aria-describedby') ?? '';
    const shown = document.getElementById(describedBy)?.textContent ?? '';
    expect(shown).toBe(message('ui.location.disclosure'));
    expect(screen.getAllByText(shown)).toHaveLength(1);
  });

  it('M1: the disclosure says what the weather service receives and that it may log, and what the app does not do', () => {
    const text = message('ui.location.disclosure');
    // What is sent (each item named), to whom, and the service-side logging caveat.
    expect(text).toMatch(/weather service/i);
    expect(text).toMatch(/text you search for/i);
    expect(text).toMatch(/location used for the weather/i);
    expect(text).toMatch(/rounded to two decimal places/i);
    expect(text).toMatch(/IP address/i);
    expect(text).toMatch(/may log requests/i);
    // The app's own promise is limited to what it controls, and is not stated as a promise about the service.
    expect(text).toMatch(/This app does not save your device location\./);
    expect(text).not.toMatch(/\b(anonymous|private|never stored|not stored|not logged|no logs)\b/i);
    expect(text).not.toMatch(/\bare sent\b/); // the old wording claimed only two items were sent
    // Short enough to read next to the button.
    expect(text.length).toBeLessThan(300);
  });

  it('M1: the disclosure does not hard-code the retention period of the service', () => {
    // The provider's terms (read 2026-10-27) give a 90-day figure; it can change, so the UI only says "may log".
    expect(message('ui.location.disclosure')).not.toMatch(/90|days/);
  });

  it.each(['prompt', 'denied', 'unsupported'] as const)(
    'first paint with permission %s triggers no location request and shows no weather',
    async (permission) => {
      const t = renderStack({ permission });
      await act(() => t.controller.start());
      expect(t.location.permissionCalls).toBeGreaterThan(0); // the state was read, so start() really ran
      expect(t.location.positionScript.callCount).toBe(0);
      expect(screen.queryByRole('heading', { name: 'Current location' })).toBeNull();
    },
  );

  it('permission already granted is the only case where launch asks for the position, with no click', async () => {
    const t = renderStack({ permission: 'granted' });
    t.location.positionScript.respondWith(ok({ lat: 1, lon: 2 }));
    expect(t.location.positionScript.callCount).toBe(0); // nothing before start()
    await act(() => t.controller.start());
    expect(t.location.positionScript.callCount).toBe(1);
    expect(await screen.findByRole('heading', { name: 'Current location' })).toBeTruthy();
  });

  it('calls the controller only when the button is activated', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    expect(controller.useMyLocation).not.toHaveBeenCalled();
    await user.click(control());
    expect(controller.useMyLocation).toHaveBeenCalledTimes(1);
  });

  it('with the real controller, the click is what asks the platform for the position', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.respondWith(ok({ lat: 1, lon: 2 }));
    await act(() => t.controller.start());
    expect(t.location.positionScript.callCount).toBe(0);
    await user.click(control());
    expect(t.location.positionScript.callCount).toBe(1);
    expect(await screen.findByRole('heading', { name: 'Current location' })).toBeTruthy();
  });

  it.each([
    ['denied', locationDenied(), /Location access was denied/],
    ['timeout', timeoutError(), /took too long/],
    ['unavailable', locationUnavailable(), /could not be determined/],
  ])('%s: shows a message and city search still works', async (_name, error, text) => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.respondWith(err(error));
    await user.click(control());
    expect(await screen.findByText(text)).toBeTruthy();
    const input = screen.getByLabelText('City name') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(false);
    t.geocoding.searchScript.respondWith(ok([city(7, { name: 'Zed' })]));
    await user.type(input, 'Zed{Enter}');
    expect(await screen.findByRole('heading', { name: /Zed/ })).toBeTruthy();
    // The location error clears once a city is shown.
    await waitFor(() => expect(screen.queryByText(text)).toBeNull());
  });

  it('permission denied up front: shows the denied message and keeps search available', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'denied' });
    await act(() => t.controller.start());
    await user.click(control());
    expect(await screen.findByText(/Location access was denied/)).toBeTruthy();
    expect(t.location.positionScript.callCount).toBe(0);
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
  });

  it('while locating: shows progress once, marks only this button unavailable, keeps search enabled', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.hold();
    await user.click(control());
    // The progress text is announced by the status area only (one source).
    expect(within(screen.getByRole('region', { name: 'Status' })).getByText('Finding your location...')).toBeTruthy();
    expect(screen.getAllByText('Finding your location...')).toHaveLength(1);
    expect(isDisabled(control())).toBe(true);
    // Still focusable: a busy control must not drop keyboard focus.
    expect((control() as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
    await act(async () => {
      t.location.positionScript.resolveNext(ok({ lat: 1, lon: 2 }));
    });
    await waitFor(() => expect(isDisabled(control())).toBe(false));
  });
});

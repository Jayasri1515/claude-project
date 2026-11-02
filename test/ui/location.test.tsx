// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { permissionDenied, positionUnavailable, timeoutError } from '../../src/core/errors';
import { err, ok } from '../../src/core/result';
import { message } from '../../src/core/messages';
import { city, isDisabled, renderStack, renderWithFakeController } from './helpers';

const control = () => screen.getByRole('button', { name: 'Use my location' });

const DENIED = 'Location access is turned off for this site. You can search for a city instead.';
const DENIED_HINT = 'To use your location, allow location access for this site in your browser settings, then choose Use my location.';
const TIMEOUT = 'Finding your location took too long. You can search for a city instead, or choose Use my location to try again.';
const TIMEOUT_PROMPT_HINT =
  'Finding your location took too long. Your browser may still be waiting for your answer to its location prompt. You can search for a city instead, or choose Use my location to try again.';

afterEach(() => {
  vi.useRealTimers();
});

describe('"Use my location" control (TASK-032)', () => {
  it('is prominent; the privacy disclosure (M-24) stays in the footer and is not read on every focus', () => {
    renderWithFakeController();
    expect(control().getAttribute('aria-describedby')).toBeNull();
    expect(screen.getAllByText(message('ui.footer.privacy'))).toHaveLength(1);
    expect(screen.getByText(message('ui.footer.privacy')).closest('footer')).not.toBeNull();
  });

  it.each(['granted', 'prompt', 'unknown'] as const)(
    'app open with permission %s asks for the position without any click and shows the weather (REQ-WF2-01, REQ-WF2-02)',
    async (permission) => {
      const t = renderStack({ permission });
      t.location.positionScript.respondWith(ok({ lat: 1, lon: 2 }));
      expect(t.location.positionScript.callCount).toBe(0); // nothing before start()
      await act(() => t.controller.start());
      expect(t.location.positionScript.callCount).toBe(1);
      expect(await screen.findByRole('heading', { name: 'Current location' })).toBeTruthy();
    },
  );

  it('app open with permission denied makes no request, shows the denied text with the settings hint and no weather', async () => {
    const t = renderStack({ permission: 'denied' });
    await act(() => t.controller.start());
    expect(t.location.permissionCalls).toBeGreaterThan(0); // the state was read, so start() really ran
    expect(t.location.positionScript.callCount).toBe(0);
    expect(screen.queryByRole('heading', { name: 'Current location' })).toBeNull();
    expect(screen.getByText(DENIED)).toBeTruthy();
    expect(screen.getByText(DENIED_HINT)).toBeTruthy();
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
  });

  it('app open on a browser without geolocation shows the unsupported text (M-12) and keeps search', async () => {
    const t = renderStack({ permission: 'unsupported' });
    await act(() => t.controller.start());
    expect(t.location.positionScript.callCount).toBe(0);
    expect(screen.getByText('Location detection is not available in this browser. You can search for a city instead.')).toBeTruthy();
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
  });

  it('a denial the platform does not report as denied shows the denied text without the settings hint', async () => {
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.respondWith(err(permissionDenied()));
    await act(() => t.controller.start());
    expect(screen.getByText(DENIED)).toBeTruthy();
    expect(screen.queryByText(DENIED_HINT)).toBeNull();
  });

  it('an unanswered prompt shows "Detecting your location..." and the search-instead cue, in the status area only, with search enabled', async () => {
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.hold();
    t.location.grantScript.hold();
    act(() => void t.controller.start());
    const status = within(screen.getByRole('region', { name: 'Status' }));
    expect(await status.findByText('Detecting your location...')).toBeTruthy();
    expect(status.getByText('Taking a while? You can search for a city instead.')).toBeTruthy();
    expect(screen.getAllByText('Detecting your location...')).toHaveLength(1);
    expect(screen.getAllByText('Taking a while? You can search for a city instead.')).toHaveLength(1);
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Current location' })).toBeNull();
  });

  it('the waiting text and the cue disappear once the position arrives', async () => {
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.hold();
    t.location.grantScript.hold();
    act(() => void t.controller.start());
    await screen.findByText('Detecting your location...');
    await act(async () => {
      t.location.positionScript.resolveNext(ok({ lat: 1, lon: 2 }));
    });
    await screen.findByRole('heading', { name: 'Current location' });
    expect(screen.queryByText('Detecting your location...')).toBeNull();
    expect(screen.queryByText(/Taking a while\?/)).toBeNull();
  });

  describe('when the app-owned watchdog fires', () => {
    it.each([
      ['granted', TIMEOUT],
      ['unknown', TIMEOUT_PROMPT_HINT],
    ] as const)('permission %s: shows the approved timeout text and a usable "Use my location" control', async (permission, text) => {
      vi.useFakeTimers();
      const t = renderStack({ permission });
      t.location.positionScript.hold();
      act(() => void t.controller.start());
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(screen.getByText('Detecting your location...')).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(t.config.locationTimeoutMs));
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.queryByText('Detecting your location...')).toBeNull();
      expect(screen.queryByText(/Taking a while\?/)).toBeNull();
      expect(isDisabled(control())).toBe(false);
      expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
      // The retry is not blocked by the still-open first attempt.
      t.location.positionScript.release();
      t.location.positionScript.respondWith(ok({ lat: 3, lon: 4 }));
      await act(async () => {
        control().click();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(t.location.positionScript.callCount).toBe(2);
      expect(screen.getByRole('heading', { name: 'Current location' })).toBeTruthy();
      expect(screen.queryByText(text)).toBeNull();
    });
  });

  it('calls the controller only when the button is activated', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    expect(controller.useMyLocation).not.toHaveBeenCalled();
    await user.click(control());
    expect(controller.useMyLocation).toHaveBeenCalledTimes(1);
  });

  it('with the real controller, the button starts a new attempt after one that ended', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.respondWith(err(permissionDenied()));
    await act(() => t.controller.start());
    expect(t.location.positionScript.callCount).toBe(1);
    t.location.positionScript.respondWith(ok({ lat: 1, lon: 2 }));
    await user.click(control());
    expect(t.location.positionScript.callCount).toBe(2);
    expect(await screen.findByRole('heading', { name: 'Current location' })).toBeTruthy();
  });

  it.each([
    ['denied', permissionDenied(), /Location access is turned off for this site/],
    ['timeout', timeoutError(), /took too long/],
    ['unavailable', positionUnavailable(), /could not be determined/],
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
    expect(await screen.findByText(DENIED)).toBeTruthy();
    expect(t.location.positionScript.callCount).toBe(0);
    expect((screen.getByLabelText('City name') as HTMLInputElement).disabled).toBe(false);
  });

  it('while locating: shows progress once, marks only this button unavailable, keeps search enabled', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.hold();
    await user.click(control());
    // The progress text is announced by the status area only (one source).
    expect(within(screen.getByRole('region', { name: 'Status' })).getByText('Detecting your location...')).toBeTruthy();
    expect(screen.getAllByText('Detecting your location...')).toHaveLength(1);
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

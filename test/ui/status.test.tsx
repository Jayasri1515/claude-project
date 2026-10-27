// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ERROR_CODES, appError } from '../../src/core/errors';
import { message, messageForError } from '../../src/core/messages';
import { createConfig } from '../../src/core/config';
import { createInitialState, ViewStateStore } from '../../src/core/store';
import { ok } from '../../src/core/result';
import { App } from '../../src/ui/App';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary';
import { sampleSnapshot } from '../fixtures/domain';
import { city, makeFakeController, renderStack, renderWithFakeController } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const statusArea = () => screen.getByRole('region', { name: 'Status' });

describe('Status area and loading states (TASK-034)', () => {
  it('has a polite live region that is in the document from the start', () => {
    renderWithFakeController();
    const live = within(statusArea()).getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('announces a transient message inside the live region, and it can be dismissed', async () => {
    const user = userEvent.setup();
    const { store } = renderWithFakeController();
    act(() => {
      store.pushMessage('ui.favoriteDuplicate');
    });
    const live = within(statusArea()).getByRole('status');
    expect(within(live).getByText('This city is already in your favorites.')).toBeTruthy();
    await user.click(within(live).getByRole('button', { name: 'Dismiss' }));
    expect(within(live).queryByText('This city is already in your favorites.')).toBeNull();
  });

  // The indicator is derived from state and rendered in the same pass as the selection, so it
  // appears at 0 ms whatever loadingIndicatorMaxDelayMs is. The strictest honest assertion is
  // therefore "visible with NO timer advanced" (this also satisfies every configured maximum,
  // and fails if a deferral such as a setTimeout before showing it is introduced). Measured on
  // the fake clock; this is not a measurement of real latency (NFR-004 stays TBD, TASK-042).
  it('the loading indicator is on screen immediately after the selection, before any fake time passes', async () => {
    vi.useFakeTimers();
    const t = renderStack({ config: createConfig({ loadingIndicatorMaxDelayMs: 200 }) });
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    const indicatorShown = (): boolean =>
      within(statusArea()).queryByText('Loading weather...') !== null &&
      within(screen.getByRole('region', { name: 'Current weather' })).queryByText('Loading...') !== null;
    expect(indicatorShown()).toBe(false); // not shown before the selection (the check can fail)

    act(() => {
      void t.controller.chooseCandidate(city(1));
    });
    expect(indicatorShown()).toBe(true); // shown with no fake time advanced
    // Both requests really are outstanding (so the indicator is not left over from something else), and the
    // indicator is still there once the configured maximum delay has passed (fails if it flickers off or is replaced).
    await vi.waitFor(() => expect(t.weather.currentScript.pending).toHaveLength(1));
    expect(t.weather.forecastScript.pending).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(indicatorShown()).toBe(true);
  });

  it('while locating and searching the indicator text is also immediate', async () => {
    vi.useFakeTimers();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.hold();
    t.geocoding.searchScript.hold();
    act(() => {
      void t.controller.useMyLocation();
    });
    expect(within(statusArea()).queryByText('Finding your location...')).not.toBeNull();
    act(() => {
      void t.controller.searchCity('Oslo');
    });
    expect(within(statusArea()).queryByText('Searching...')).not.toBeNull();
  });

  it('shows "Searching..." while a search is in flight', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.hold();
    await user.type(screen.getByLabelText('City name'), 'Oslo{Enter}');
    expect(within(statusArea()).getByText('Searching...')).toBeTruthy();
    await act(async () => {
      t.geocoding.searchScript.resolveNext(ok([]));
    });
    expect(within(statusArea()).queryByText('Searching...')).toBeNull();
  });

  // Real rendering paths: each error code is pushed through every component that
  // can show an AppError. The error object is given extra fields that must never
  // appear, so only the message-table text can reach the page.
  describe.each(APP_ERROR_CODES)('error %s', (code) => {
    const hostile = { ...appError(code), detail: 'SECRET-DETAIL', stack: 'at SECRET-STACK', url: 'https://example.invalid/?key=zzz' };
    const text = messageForError(appError(code));
    const noLeak = (): void => {
      for (const forbidden of ['SECRET-DETAIL', 'SECRET-STACK', 'example.invalid', 'key=zzz']) {
        expect(document.body.textContent).not.toContain(forbidden);
      }
    };

    it('search error renders its table text and nothing else', () => {
      const { store } = renderWithFakeController();
      act(() => {
        store.setState({ search: { status: 'error', error: hostile } });
      });
      expect(screen.getAllByText(text)).toHaveLength(1);
      noLeak();
    });

    it('location error renders its table text and nothing else', () => {
      const { store } = renderWithFakeController();
      act(() => {
        store.setState({ locationFlow: { status: 'error', error: hostile } });
      });
      expect(screen.getAllByText(text)).toHaveLength(1);
      noLeak();
    });

    it('current and forecast section errors render their table text, each in its own section', () => {
      renderWithFakeController({
        snapshot: { ...sampleSnapshot, current: { status: 'error', error: hostile }, forecast: { status: 'error', error: hostile } },
      });
      const current = screen.getByRole('region', { name: 'Current weather' });
      const forecast = screen.getByRole('region', { name: 'Forecast' });
      expect(within(current).getAllByText(text)).toHaveLength(1);
      expect(within(forecast).getAllByText(text)).toHaveLength(1);
      noLeak();
    });
  });

  it('a provider failure never leaks its detail into the page', async () => {
    const t = renderStack();
    t.weather.currentScript.failWith(new Error('SECRET stack http://example.invalid/?apikey=zzz'));
    t.weather.forecastScript.failWith(new Error('SECRET stack http://example.invalid/?apikey=zzz'));
    await act(() => t.controller.chooseCandidate(city(1)));
    expect(document.body.textContent).toContain(message('error.serviceUnavailable'));
    expect(document.body.textContent).not.toContain('SECRET');
    expect(document.body.textContent).not.toContain('apikey');
  });
});

describe('Error boundary (TASK-034)', () => {
  it('shows a safe fallback with no error detail, and can recover', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    let broken = true;
    const Bomb = () => {
      if (broken) throw new Error('SECRET stack http://example.invalid/?apikey=zzz');
      return <p>recovered</p>;
    };
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(message('ui.unexpectedError'));
    expect(document.body.textContent).not.toContain('SECRET');
    expect(document.body.textContent).not.toContain('apikey');
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('recovered')).toBeTruthy();
  });

  it('the whole app falls back safely when rendering throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new ViewStateStore(createInitialState());
    render(<App store={store} controller={makeFakeController()} config={createConfig()} />);
    vi.spyOn(store, 'getState').mockImplementation(() => {
      throw new Error('SECRET render failure');
    });
    act(() => {
      store.setState({ temperatureUnit: 'F' });
    });
    expect(screen.getByRole('alert').textContent).toContain(message('ui.unexpectedError'));
    expect(document.body.textContent).not.toContain('SECRET');
  });
});

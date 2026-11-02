// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serviceUnavailable } from '../../src/core/errors';
import { err, ok } from '../../src/core/result';
import { ErrorBoundary } from '../../src/ui/ErrorBoundary';
import { sampleSnapshot } from '../fixtures/domain';
import { city, isDisabled, renderStack, renderWithFakeController } from './helpers';

/**
 * Focus management (NFR-003, review finding M2). Keyboard focus must never be
 * left on a control that disappears or becomes unusable, and must move to the
 * outcome of a search or choice.
 */
const A = city(1, { name: 'Alpha', admin1: 'Region A', country: 'Land A' });
const B = city(2, { name: 'Beta', admin1: 'Region B', country: 'Land B' });
const activeId = (): string => document.activeElement?.id ?? '';
const refreshButton = () => screen.getByRole('button', { name: 'Refresh' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('busy controls keep focus', () => {
  it('Refresh stays the focused element while a refresh is pending (aria-disabled, not disabled)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    await user.click(refreshButton());
    expect(document.activeElement).toBe(refreshButton());
    expect((refreshButton() as HTMLButtonElement).disabled).toBe(false);
    expect(isDisabled(refreshButton())).toBe(true);
  });

  it('an ignored activation of a busy control does not call the controller again', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController({ snapshot: sampleSnapshot });
    controller.refresh.mockImplementation(() => new Promise<void>(() => undefined));
    await user.click(refreshButton());
    await user.click(refreshButton());
    expect(controller.refresh).toHaveBeenCalledTimes(1);
  });

  it('"Use my location" stays focusable while locating', async () => {
    const user = userEvent.setup();
    const t = renderStack({ permission: 'prompt' });
    t.location.positionScript.hold();
    const button = screen.getByRole('button', { name: 'Use my location' });
    await user.click(button);
    expect(document.activeElement).toBe(button);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(isDisabled(button)).toBe(true);
  });
});

describe('controls that are replaced hand focus on', () => {
  it('Retry (current weather) moves focus to the section heading before its block is replaced', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.weather.currentScript.respondWith(err(serviceUnavailable()));
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await act(() => t.controller.chooseCandidate(A));
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    const current = screen.getByRole('region', { name: 'Current weather' });
    await user.click(within(current).getByRole('button', { name: 'Retry' }));
    expect(within(current).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(activeId()).toBe('section-current-heading');
  });

  it('Retry (forecast) moves focus to the forecast heading', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await act(() => t.controller.chooseCandidate(A));
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    await user.click(within(forecast).getByRole('button', { name: 'Retry' }));
    expect(activeId()).toBe('section-forecast-heading');
  });

  it('Add to favorites hands focus to the new favorite, not to the page start', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Alpha, Region A, Land A Showing' }));
  });

  it('Remove hands focus to a neighbouring favorite, and to the heading when the list empties', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    await act(() => t.controller.addFavorite());
    await act(() => t.controller.chooseCandidate(B));
    await act(() => t.controller.addFavorite());

    await user.click(screen.getByRole('button', { name: 'Remove Alpha, Region A, Land A from favorites' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Beta, Region B, Land B Showing' }));

    await user.click(screen.getByRole('button', { name: 'Remove Beta, Region B, Land B from favorites' }));
    expect(activeId()).toBe('section-favorites-heading');
  });

  it('Dismiss hands focus to the next Dismiss button, then to the page title', async () => {
    const user = userEvent.setup();
    const { store } = renderWithFakeController();
    act(() => {
      store.pushMessage('ui.favoriteDuplicate');
      store.pushMessage('ui.favoriteLimitReached');
    });
    const status = screen.getByRole('region', { name: 'Status' });
    await user.click(within(status).getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(document.activeElement).toBe(within(status).getByRole('button', { name: 'Dismiss' }));
    await user.click(within(status).getByRole('button', { name: 'Dismiss' }));
    expect(activeId()).toBe('app-title');
  });

  it('does not move focus on first render (StrictMode-safe: nothing steals focus at mount)', () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    expect(document.activeElement).toBe(document.body);
  });
});

describe('focus follows the outcome of a search or choice', () => {
  it('a single match moves focus to the current weather heading', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A]));
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    expect(await within(screen.getByRole('region', { name: 'Current weather' })).findByRole('heading', { name: /Alpha/ })).toBeTruthy();
    expect(activeId()).toBe('section-current-heading');
  });

  it('several matches move focus to the chooser, which is a labelled group', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    const group = await screen.findByRole('group', { name: 'Several places match. Choose one:' });
    expect(document.activeElement).toBe(within(group).getByRole('heading'));
  });

  it('choosing a candidate moves focus to the current weather heading (the chooser is gone)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Beta, Region B, Land B' }));
    expect(screen.queryByRole('group', { name: 'Several places match. Choose one:' })).toBeNull();
    expect(activeId()).toBe('section-current-heading');
  });

  it('an error leaves focus in the search form', async () => {
    const user = userEvent.setup();
    renderStack();
    await user.type(screen.getByLabelText('City name'), '   {Enter}');
    expect(document.activeElement).toBe(screen.getByLabelText('City name'));
  });

  it('does not pull focus back when the user has moved on to another control', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.hold();
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    const elsewhere = screen.getByRole('link', { name: 'Forecast' });
    elsewhere.focus();
    await act(async () => {
      t.geocoding.searchScript.resolveNext(ok([A]));
    });
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe('navigation anchors', () => {
  it('every link targets a focusable element (tabindex -1), so following it moves focus', () => {
    renderWithFakeController();
    const links = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const link of links) {
      const target = document.getElementById(link.getAttribute('href')?.slice(1) ?? '');
      expect(target).not.toBeNull();
      expect(target?.getAttribute('tabindex')).toBe('-1');
      target?.focus();
      expect(document.activeElement).toBe(target);
    }
  });
});

describe('error boundary focus', () => {
  const Bomb = ({ broken }: { broken: { value: boolean } }) => {
    if (broken.value) throw new Error('SECRET');
    return <h1 id="page-title" tabIndex={-1}>ok</h1>;
  };

  it('puts focus on the fallback when it appears, and on the restore target after Try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const broken = { value: true };
    render(
      <ErrorBoundary restoreFocus={() => document.getElementById('page-title')}>
        <Bomb broken={broken} />
      </ErrorBoundary>,
    );
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    broken.value = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(activeId()).toBe('page-title');
  });

  it('the app title is the restore target for the whole app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { store } = renderWithFakeController();
    const real = store.getState.bind(store);
    let fail = true;
    vi.spyOn(store, 'getState').mockImplementation(() => {
      if (fail) throw new Error('SECRET');
      return real();
    });
    act(() => {
      store.setState({ temperatureUnit: 'F' });
    });
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(activeId()).toBe('app-title');
  });
});

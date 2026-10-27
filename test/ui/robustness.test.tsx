// @vitest-environment jsdom
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serviceUnavailable } from '../../src/core/errors';
import { err, ok } from '../../src/core/result';
import { createConfig } from '../../src/core/config';
import { createInitialState, ViewStateStore } from '../../src/core/store';
import { App } from '../../src/ui/App';
import { useLayout, watchMediaQuery } from '../../src/ui/useLayout';
import { sampleForecast, sampleSnapshot } from '../fixtures/domain';
import { city, createStack, makeFakeController, renderStack, renderWithFakeController } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

const breakpoints = createConfig().breakpoints;

describe('one refresh guard for Refresh and both Retry buttons (L1, AC-P-03)', () => {
  const bothFailed = {
    ...sampleSnapshot,
    current: { status: 'error', error: serviceUnavailable() } as const,
    forecast: { status: 'error', error: serviceUnavailable() } as const,
  };

  it('Retry (current), Retry (forecast) and Refresh together send ONE refresh while it is pending', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController({ snapshot: bothFailed });
    controller.refresh.mockImplementation(() => new Promise<void>(() => undefined));
    const current = screen.getByRole('region', { name: 'Current weather' });
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    await user.click(within(current).getByRole('button', { name: 'Retry' }));
    await user.click(within(forecast).getByRole('button', { name: 'Retry' }));
    await user.click(within(current).getByRole('button', { name: 'Refresh' }));
    await user.click(within(current).getByRole('button', { name: 'Retry' }));
    expect(controller.refresh).toHaveBeenCalledTimes(1);
    for (const button of screen.getAllByRole('button', { name: /Retry|Refresh/ })) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('with the real controller, mixed activations cause one provider call per section', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.weather.currentScript.respondWith(err(serviceUnavailable()));
    t.weather.forecastScript.respondWith(err(serviceUnavailable()));
    await act(() => t.controller.chooseCandidate(city(1)));
    t.weather.currentScript.hold();
    t.weather.forecastScript.hold();
    const current = screen.getByRole('region', { name: 'Current weather' });
    const forecast = screen.getByRole('region', { name: 'Forecast' });
    const refresh = within(current).getByRole('button', { name: 'Refresh' });
    const retryForecast = within(forecast).getByRole('button', { name: 'Retry' });
    await user.click(within(current).getByRole('button', { name: 'Retry' }));
    await user.click(refresh);
    if (retryForecast.isConnected) await user.click(retryForecast);
    expect(t.weather.currentScript.callCount).toBe(2);
    expect(t.weather.forecastScript.callCount).toBe(2);
    await act(async () => {
      t.weather.currentScript.resolveNext(ok({ temperatureC: 5 }));
      t.weather.forecastScript.resolveNext(ok(sampleForecast));
    });
    expect(within(current).getByRole('button', { name: 'Refresh' }).getAttribute('aria-disabled')).toBeNull();
  });
});

describe('StrictMode (L2)', () => {
  it('a full search, favorite and refresh flow works once under StrictMode', async () => {
    const user = userEvent.setup();
    const stack = createStack();
    stack.geocoding.searchScript.respondWith(ok([city(1, { name: 'Alpha' })]));
    render(
      <StrictMode>
        <App store={stack.store} controller={stack.controller} config={stack.config} />
      </StrictMode>,
    );
    expect(document.activeElement).toBe(document.body);
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    expect(await screen.findByRole('heading', { name: 'Alpha, Testshire, Testland' })).toBeTruthy();
    expect(stack.geocoding.searchScript.callCount).toBe(1);
    expect(stack.weather.currentScript.callCount).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(screen.getAllByRole('button', { name: 'Alpha, Testshire, Testland Showing' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(stack.weather.currentScript.callCount).toBe(2);
  });

  it('first render under StrictMode moves no focus and shows one copy of each region', () => {
    const store = new ViewStateStore(createInitialState({ snapshot: sampleSnapshot }));
    render(
      <StrictMode>
        <App store={store} controller={makeFakeController()} config={createConfig()} />
      </StrictMode>,
    );
    expect(document.activeElement).toBe(document.body);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('region')).toHaveLength(5);
  });
});

describe('store subscription is stable (L2)', () => {
  it('re-rendering does not resubscribe to the store', () => {
    const store = new ViewStateStore(createInitialState());
    const subscribe = vi.spyOn(store, 'subscribe');
    const view = render(<App store={store} controller={makeFakeController()} config={createConfig()} />);
    const afterMount = subscribe.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0);
    for (const unit of ['F', 'C', 'F'] as const) {
      act(() => {
        store.setState({ temperatureUnit: unit });
      });
    }
    view.rerender(<App store={store} controller={makeFakeController()} config={createConfig()} />);
    expect(subscribe.mock.calls.length).toBe(afterMount);
  });
});

/** A controllable matchMedia: the viewport width can change and listeners are tracked. */
function installMatchMedia(initialWidth: number, style: 'events' | 'legacy') {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  const stub = (query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? '0');
    const base = {
      get matches() {
        return width >= min;
      },
      media: query,
    };
    if (style === 'events') {
      return {
        ...base,
        addEventListener: (_type: string, l: () => void) => listeners.add(l),
        removeEventListener: (_type: string, l: () => void) => listeners.delete(l),
      };
    }
    return {
      ...base,
      addListener: (l: () => void) => listeners.add(l),
      removeListener: (l: () => void) => listeners.delete(l),
    };
  };
  vi.stubGlobal('matchMedia', stub);
  return {
    listeners,
    resize(next: number) {
      width = next;
      act(() => {
        for (const l of [...listeners]) l();
      });
    },
  };
}

describe('useLayout (L2)', () => {
  it.each(['events', 'legacy'] as const)('follows viewport changes and unsubscribes on unmount (%s API)', (style) => {
    const media = installMatchMedia(500, style);
    const { result, unmount } = renderHook(() => useLayout(breakpoints));
    expect(result.current).toBe('narrow');
    expect(media.listeners.size).toBeGreaterThan(0);
    media.resize(800);
    expect(result.current).toBe('wide');
    media.resize(1200);
    expect(result.current).toBe('extra-wide');
    media.resize(300);
    expect(result.current).toBe('narrow');
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('watchMediaQuery does nothing, without throwing, for a list with neither API', () => {
    const stop = watchMediaQuery({} as MediaQueryList, () => undefined);
    expect(() => stop()).not.toThrow();
  });
});

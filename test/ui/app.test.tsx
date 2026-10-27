// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfig } from '../../src/core/config';
import { createInitialState, ViewStateStore } from '../../src/core/store';
import { App } from '../../src/ui/App';
import { makeFakeController, renderWithFakeController } from './helpers';

/** matchMedia stub that evaluates "(min-width: Npx)" against a fixed viewport width. */
function stubViewport(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? '0');
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App shell (TASK-026)', () => {
  it('has the semantic landmarks and one h1', () => {
    renderWithFakeController();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows the four sections in one fixed order inside main', () => {
    renderWithFakeController();
    const main = screen.getByRole('main');
    const names = within(main)
      .getAllByRole('region')
      .map((region) => region.getAttribute('id'));
    expect(names).toEqual(['section-search', 'section-current', 'section-forecast', 'section-favorites']);
    for (const name of ['Search for a city', 'Current weather', 'Forecast', 'Favorites']) {
      expect(within(main).getByRole('region', { name })).toBeTruthy();
    }
  });

  it('navigation links point at existing sections (one consistent model)', () => {
    renderWithFakeController();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Search', 'Current weather', 'Forecast', 'Favorites']);
    for (const link of links) {
      const target = link.getAttribute('href')?.slice(1) ?? '';
      expect(document.getElementById(target)).not.toBeNull();
    }
  });

  it('is the narrow single-column tier where matchMedia is absent', () => {
    const { container } = renderWithFakeController();
    expect(container.querySelector('.app')?.getAttribute('data-layout')).toBe('narrow');
  });

  it.each([
    [320, 'narrow'],
    [767, 'narrow'],
    [768, 'wide'],
    [1023, 'wide'],
    [1280, 'extra-wide'],
  ])('at %i px the layout tier comes from Config.breakpoints: %s', (width, tier) => {
    stubViewport(width);
    const { container } = renderWithFakeController();
    expect(container.querySelector('.app')?.getAttribute('data-layout')).toBe(tier);
  });

  it('uses overridden breakpoints from Config, not a fixed width', () => {
    stubViewport(500);
    const store = new ViewStateStore(createInitialState());
    const { container } = render(
      <App
        store={store}
        controller={makeFakeController()}
        config={createConfig({ breakpoints: { wide: 480, extraWide: 900 } })}
      />,
    );
    expect(container.querySelector('.app')?.getAttribute('data-layout')).toBe('wide');
  });

  it('shows the demo notice only in demo mode', () => {
    const store = new ViewStateStore(createInitialState());
    const config = createConfig();
    const { rerender } = render(<App store={store} controller={makeFakeController()} config={config} />);
    expect(screen.queryByRole('note')).toBeNull();
    rerender(<App store={store} controller={makeFakeController()} config={config} demo />);
    expect(screen.getByRole('note').textContent).toContain('Demo mode');
  });

  it('shows empty states before anything is chosen', () => {
    renderWithFakeController();
    expect(screen.getByText('Search for a city or use your location to see the weather.')).toBeTruthy();
    expect(screen.getByText('No favorites yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });
});

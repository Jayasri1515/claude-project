// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FAVORITES_STORAGE_KEY } from '../../src/core/favorites/favoritesService';
import { ok } from '../../src/core/result';
import { InMemoryKeyValueStore } from '../fakes';
import { city, renderStack, renderWithFakeController } from './helpers';

const A = city(1, { name: 'Alpha', admin1: 'Region A', country: 'Land A' });
const B = city(2, { name: 'Beta', admin1: 'Region B', country: 'Land B' });
const favorites = () => screen.getByRole('region', { name: 'Favorites' });
const current = () => screen.getByRole('region', { name: 'Current weather' });
const stored = (kv: InMemoryKeyValueStore): { favorites: Array<{ key: string }> } =>
  JSON.parse(kv.data.get(FAVORITES_STORAGE_KEY) ?? '{"favorites":[]}') as { favorites: Array<{ key: string }> };

describe('Favorites UI (TASK-031)', () => {
  it('offers no add control before a city is shown', () => {
    renderWithFakeController();
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    expect(within(favorites()).getByText('No favorites yet.')).toBeTruthy();
  });

  it('the add control sends the add intent', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController({ selectedLocation: A, snapshot: undefined });
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(controller.addFavorite).toHaveBeenCalledTimes(1);
  });

  it('adds the shown city, lists it, and then no longer offers the add control (no duplicates)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(await within(favorites()).findByRole('button', { name: 'Alpha, Region A, Land A Showing' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    expect(within(favorites()).getByText('This city is in your favorites.')).toBeTruthy();
    expect(stored(t.kv).favorites).toHaveLength(1);
    // The controller also refuses a duplicate if asked again.
    await act(() => t.controller.addFavorite());
    expect(stored(t.kv).favorites).toHaveLength(1);
    expect(screen.getByText('This city is already in your favorites.')).toBeTruthy();
  });

  it('selecting a favorite shows its weather without a name search', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    await act(() => t.controller.addFavorite());
    await act(() => t.controller.chooseCandidate(B));
    expect(within(current()).getByRole('heading', { name: 'Beta, Region B, Land B' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show weather for Alpha, Region A, Land A' }));
    expect(await within(current()).findByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    expect(t.geocoding.searchScript.callCount).toBe(0);
    expect(screen.getByRole('button', { name: 'Alpha, Region A, Land A Showing' }).getAttribute('aria-current')).toBe('true');
  });

  it('WCAG 2.5.3 Label in Name: every favorite select button name contains its visible text, including the Showing marker', async () => {
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    await act(() => t.controller.addFavorite());
    await act(() => t.controller.chooseCandidate(B));
    await act(() => t.controller.addFavorite());
    const buttons = Array.from(favorites().querySelectorAll<HTMLButtonElement>('.favorite-select'));
    expect(buttons).toHaveLength(2);
    const shown = buttons.filter((b) => b.getAttribute('aria-current') === 'true');
    expect(shown).toHaveLength(1);
    expect(shown[0]?.textContent).toContain('Showing');
    for (const button of buttons) {
      const visible = (button.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const name = (button.getAttribute('aria-label') ?? button.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      expect(name, button.outerHTML).toContain(visible);
    }
  });

  it('removing a favorite updates the list; removing the displayed one keeps the weather and re-enables add', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(A));
    await act(() => t.controller.addFavorite());
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove Alpha, Region A, Land A from favorites' }));
    await waitFor(() => expect(within(favorites()).getByText('No favorites yet.')).toBeTruthy());
    expect(within(current()).getByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    expect(within(current()).getByText('22°C')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toBeTruthy();
    expect(stored(t.kv).favorites).toHaveLength(0);
  });

  it('lists favorites saved earlier on launch (persistence across a reload)', async () => {
    const kv = new InMemoryKeyValueStore();
    const first = renderStack({ kv });
    await act(() => first.controller.chooseCandidate(A));
    await act(() => first.controller.addFavorite());
    first.unmount();
    const second = renderStack({ kv });
    await act(() => second.controller.start());
    expect(within(favorites()).getByRole('button', { name: 'Show weather for Alpha, Region A, Land A' })).toBeTruthy();
  });

  it('shows a non-blocking notice when storage is unavailable, and the list still works for the session', async () => {
    const user = userEvent.setup();
    const kv = new InMemoryKeyValueStore();
    kv.failAll();
    const t = renderStack({ kv });
    await act(() => t.controller.start());
    expect(await within(favorites()).findByText('Favorites may not be saved on this device.')).toBeTruthy();
    await act(() => t.controller.chooseCandidate(A));
    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    expect(await within(favorites()).findByRole('button', { name: 'Alpha, Region A, Land A Showing' })).toBeTruthy();
    expect(screen.getByLabelText('City name')).toBeTruthy();
  });

  it('an unresolved device location cannot be favorited: a hint replaces the add control', async () => {
    const t = renderStack({ permission: 'granted', withReverse: false });
    t.location.positionScript.respondWith(ok({ lat: 33.3, lon: 44.4 }));
    await act(() => t.controller.useMyLocation());
    expect(within(current()).getByRole('heading', { name: 'Current location' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    expect(within(favorites()).getByText('Search for the city by name to save it as a favorite.')).toBeTruthy();
    expect(t.kv.data.get(FAVORITES_STORAGE_KEY)).toBeUndefined();
  });
});

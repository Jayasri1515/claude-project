// @vitest-environment jsdom
import axe from 'axe-core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { serviceUnavailable } from '../../src/core/errors';
import { ok } from '../../src/core/result';
import { compose } from '../../src/composition';
import { composeDemo } from '../../src/dev/demoComposition';
import { App } from '../../src/ui/App';
import { InMemoryKeyValueStore } from '../fakes';
import { sampleSnapshot } from '../fixtures/domain';
import { city, renderStack, renderWithFakeController } from './helpers';

/**
 * Automated accessibility check with axe-core (the engine behind jest-axe and
 * vitest-axe; used directly so no wrapper package is needed). It finds
 * structural problems only (names, roles, ARIA validity, landmarks, ids).
 * jsdom has no layout, so colour contrast and target size cannot be checked
 * here; they stay with the manual/browser verification (TASK-039, TASK-040).
 */
async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`);
}

describe('axe-core structural accessibility (TASK-039 groundwork)', () => {
  it('the empty app has no violations', async () => {
    renderWithFakeController();
    expect(await violations()).toEqual([]);
  });

  it('weather shown, in Fahrenheit, has no violations', async () => {
    renderWithFakeController({ snapshot: sampleSnapshot, temperatureUnit: 'F' });
    expect(await violations()).toEqual([]);
  });

  it('section errors, idle sections and a search error have no violations', async () => {
    const { store } = renderWithFakeController({
      snapshot: {
        ...sampleSnapshot,
        current: { status: 'error', error: serviceUnavailable() },
        forecast: { status: 'idle' },
      },
    });
    act(() => {
      store.setState({ search: { status: 'error', error: serviceUnavailable() } });
      store.pushMessage('ui.favoriteDuplicate');
    });
    expect(await violations()).toEqual([]);
  });

  it('the candidate chooser and a populated favorites list have no violations', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await act(() => t.controller.chooseCandidate(city(1, { name: 'Alpha' })));
    await act(() => t.controller.addFavorite());
    t.geocoding.searchScript.respondWith(ok([city(2, { name: 'Beta' }), city(3, { name: 'Beta', admin1: 'Other' })]));
    await user.type(screen.getByLabelText('City name'), 'Beta{Enter}');
    await screen.findByRole('group', { name: 'Several places match. Choose one:' });
    expect(await violations()).toEqual([]);
  });

  it('demo mode and the not-configured page have no violations', async () => {
    const demo = composeDemo({ keyValueStore: new InMemoryKeyValueStore() });
    const view = render(<App store={demo.store} controller={demo.controller} config={demo.config} demo />);
    expect(await violations()).toEqual([]);
    view.unmount();
    const none = compose({ keyValueStore: new InMemoryKeyValueStore() });
    render(<App store={none.store} controller={none.controller} config={none.config} unconfigured />);
    expect(await violations()).toEqual([]);
  });
});

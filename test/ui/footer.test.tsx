// @vitest-environment jsdom
import axe from 'axe-core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compose, composeLive, liveAttributionText } from '../../src/composition';
import { createConfig } from '../../src/core/config';
import { serviceUnavailable } from '../../src/core/errors';
import { composeDemo } from '../../src/dev/demoComposition';
import { App } from '../../src/ui/App';
import { ATTRIBUTION_URLS, splitAttribution, THIRD_PARTY_NOTICES_PATH } from '../../src/ui/attribution';
import { FakeLocationService, InMemoryKeyValueStore } from '../fakes';
import { sampleSnapshot } from '../fixtures/domain';
import { fixtureResponse, jsonResponse, stubFetch } from '../support/openMeteo';
import type { RecordedCall } from '../support/openMeteo';
import { renderWithFakeController } from './helpers';

/**
 * TASK-025: data-source credit (Open-Meteo, GeoNames) in a footer, and the notices link.
 * What the official pages say is recorded in src/ui/attribution.ts and impl-plan.md.
 */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CREDIT = 'Weather data by Open-Meteo.com. Location data based on GeoNames.';
const footer = () => screen.getByRole('contentinfo');
const links = () => within(footer()).getAllByRole('link');

function route(call: RecordedCall): Response {
  const url = new URL(call.url);
  if (url.host === 'geocoding-api.open-meteo.com') return fixtureResponse('geocoding-berlin.json');
  if (url.searchParams.has('current')) return fixtureResponse('forecast-current.json');
  if (url.searchParams.has('daily')) return fixtureResponse('forecast-daily.json');
  return jsonResponse({ error: true }, 404);
}

function renderLive(respond: (call: RecordedCall) => Response | Promise<Response> = route) {
  const stub = stubFetch(respond);
  const c = composeLive({ fetch: stub.fetch, keyValueStore: new InMemoryKeyValueStore(), locationService: new FakeLocationService('prompt') });
  const view = render(<App store={c.store} controller={c.controller} config={c.config} demo={c.demo} unconfigured={c.unconfigured} />);
  return { ...c, ...stub, ...view };
}

function stubViewport(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? '0');
    return { matches: width >= min, media: query, addEventListener: () => undefined, removeEventListener: () => undefined };
  });
}

describe('credit text and configuration', () => {
  it('composeLive sets the exact credit text from the message table', () => {
    expect(liveAttributionText()).toBe(CREDIT);
    expect(composeLive({ keyValueStore: new InMemoryKeyValueStore() }).config.attributionText).toBe(CREDIT);
  });

  it('composeLive fills in the credit when a caller passes a Config without one, and keeps other settings', () => {
    const config = createConfig({ forecastDays: 2, breakpoints: { wide: 500 } });
    const live = composeLive({ config, keyValueStore: new InMemoryKeyValueStore() }).config;
    expect(live.attributionText).toBe(CREDIT);
    expect(live.forecastDays).toBe(2);
    expect(live.breakpoints.wide).toBe(500);
    expect(live.breakpoints.extraWide).toBe(config.breakpoints.extraWide);
  });

  it('composeLive keeps a credit text that the caller deliberately set', () => {
    const config = createConfig({ attributionText: 'Custom credit' });
    expect(composeLive({ config, keyValueStore: new InMemoryKeyValueStore() }).config.attributionText).toBe('Custom credit');
  });

  it('the default Config has no credit and a plain compose() (fakes) does not add one', () => {
    expect(createConfig().attributionText).toBe('');
    expect(compose({ keyValueStore: new InMemoryKeyValueStore() }).config.attributionText).toBe('');
  });
});

describe('live mode: the footer shows the credit with working, safe links', () => {
  it('is a contentinfo landmark outside main and sections, after the main content', () => {
    renderLive();
    const f = footer();
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    expect(f.tagName).toBe('FOOTER');
    expect(f.closest('main, section, article, aside, nav, header')).toBeNull();
    const main = screen.getByRole('main');
    expect(main.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(f.parentElement?.lastElementChild).toBe(f); // last thing on the page: reading order, tab order and picture agree
  });

  it('shows the credit sentence exactly as configured, then the licence and change note', () => {
    renderLive();
    const clone = footer().cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.visually-hidden').forEach((hint) => hint.remove());
    const paragraphs = Array.from(clone.querySelectorAll('p')).map((p) => p.textContent);
    expect(paragraphs).toEqual([
      CREDIT,
      'Data licence: CC BY 4.0. Changes: values are rounded and conditions are simplified.',
      'Third-party notices',
    ]);
  });

  it('links "Weather data by Open-Meteo.com" to https://open-meteo.com/ and GeoNames to its site', () => {
    renderLive();
    const weather = within(footer()).getByRole('link', { name: /^Weather data by Open-Meteo\.com/ });
    expect(weather.getAttribute('href')).toBe('https://open-meteo.com/');
    expect(weather.textContent?.startsWith('Weather data by Open-Meteo.com')).toBe(true);
    const geonames = within(footer()).getByRole('link', { name: /^GeoNames/ });
    expect(geonames.getAttribute('href')).toBe('https://www.geonames.org/');
  });

  it('links the CC BY 4.0 licence', () => {
    renderLive();
    const licence = within(footer()).getByRole('link', { name: /^CC BY 4\.0/ });
    expect(licence.getAttribute('href')).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('links the shipped third-party notices file (relative, same site)', () => {
    renderLive();
    const notices = within(footer()).getByRole('link', { name: /^Third-party notices/ });
    expect(notices.getAttribute('href')).toBe('THIRD_PARTY_NOTICES.txt');
    expect(THIRD_PARTY_NOTICES_PATH).toBe('THIRD_PARTY_NOTICES.txt');
  });

  it('every link opens safely in a new tab: target _blank, rel noopener noreferrer, and says so in its name', () => {
    renderLive();
    expect(links()).toHaveLength(4);
    for (const link of links()) {
      expect(link.getAttribute('target'), link.textContent ?? '').toBe('_blank');
      const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
      expect(link.textContent).toContain('(opens in a new tab)');
    }
  });

  it('every external link is https and its host is exactly one of the three allowed hosts (no prefix or look-alike match)', () => {
    renderLive();
    const external = links().filter((l) => l.getAttribute('href') !== THIRD_PARTY_NOTICES_PATH);
    expect(external).toHaveLength(3);
    const allowed = ['creativecommons.org', 'open-meteo.com', 'www.geonames.org'];
    for (const link of external) {
      const url = new URL(link.getAttribute('href') ?? '');
      expect(url.protocol).toBe('https:');
      expect(allowed).toContain(url.host);
      expect(url.username + url.password).toBe('');
    }
    expect(Object.values(ATTRIBUTION_URLS).sort()).toEqual([
      'https://creativecommons.org/licenses/by/4.0/',
      'https://open-meteo.com/',
      'https://www.geonames.org/',
    ]);
  });

  it('the visible label is inside the accessible name of every link (WCAG 2.5.3)', () => {
    renderLive();
    for (const link of links()) {
      const visible = Array.from(link.childNodes)
        .filter((n) => !(n instanceof Element && n.classList.contains('visually-hidden')))
        .map((n) => n.textContent)
        .join('')
        .trim();
      expect(visible.length).toBeGreaterThan(0);
      expect(within(footer()).getByRole('link', { name: new RegExp(`^${visible.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toBe(link);
    }
  });

  it('links are focusable by keyboard in reading order, with nothing else in the footer taking focus', async () => {
    const user = userEvent.setup();
    renderLive();
    const first = links()[0] as HTMLElement;
    first.focus();
    expect(document.activeElement).toBe(first);
    const order: string[] = [first.getAttribute('href') ?? ''];
    for (let i = 1; i < links().length; i += 1) {
      await user.tab();
      order.push((document.activeElement as HTMLElement).getAttribute('href') ?? '');
    }
    expect(order).toEqual([
      'https://open-meteo.com/',
      'https://www.geonames.org/',
      'https://creativecommons.org/licenses/by/4.0/',
      'THIRD_PARTY_NOTICES.txt',
    ]);
    expect(footer().querySelectorAll('[tabindex]')).toHaveLength(0);
  });

  it('is present in every state: initial, loading, weather shown, search error, and section errors', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = renderLive(async (call) => {
      if (call.url.includes('forecast')) await gate;
      return route(call);
    });
    expect(footer().textContent).toContain('Weather data by Open-Meteo.com'); // initial
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' }));
    await screen.findByText('Loading weather...'); // loading
    expect(footer().textContent).toContain('Weather data by Open-Meteo.com');
    release?.();
    await screen.findByText('Temperature'); // weather shown
    expect(footer().textContent).toContain('Location data based on GeoNames');
    await act(async () => {
      t.store.setState({ search: { status: 'error', error: serviceUnavailable() } }); // search error
    });
    expect(footer().textContent).toContain('Weather data by Open-Meteo.com');
  });

  it('is present with section errors too (weather service down)', async () => {
    const user = userEvent.setup();
    renderLive((call) => (call.url.includes('geocoding') ? fixtureResponse('geocoding-berlin.json') : jsonResponse({ error: true }, 503)));
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' }));
    await waitFor(() => expect(screen.getAllByText(/weather service is unavailable/).length).toBeGreaterThan(0));
    expect(footer().textContent).toContain('Weather data by Open-Meteo.com');
  });

  it.each([
    [320, 'narrow'],
    [768, 'wide'],
    [1280, 'extra-wide'],
  ])('is present in the %i px (%s) tier, after main, inside the app container', (width, tier) => {
    stubViewport(width);
    const { container } = renderLive();
    expect(container.querySelector('.app')?.getAttribute('data-layout')).toBe(tier);
    expect(footer().parentElement).toBe(container.querySelector('.app'));
    expect(container.querySelector('main')?.nextElementSibling).toBe(footer());
  });

  it('credit text is rendered as text, never as markup', () => {
    const config = createConfig({ attributionText: '<img src=x onerror=alert(1)> Weather data by Open-Meteo.com' });
    renderWithFakeController({}, config);
    expect(footer().querySelector('img')).toBeNull();
    expect(footer().textContent).toContain('<img src=x onerror=alert(1)>');
    expect(within(footer()).getByRole('link', { name: /^Weather data by Open-Meteo\.com/ }).getAttribute('href')).toBe('https://open-meteo.com/');
  });
});

describe('no credit configured, demo and not-set-up modes', () => {
  it('an empty attributionText shows no credit and no licence line; only the notices link remains', () => {
    renderWithFakeController();
    expect(links().map((l) => l.getAttribute('href'))).toEqual(['THIRD_PARTY_NOTICES.txt']);
    expect(footer().textContent).not.toMatch(/Open-Meteo|GeoNames|CC BY/);
  });

  it('a blank attributionText counts as empty', () => {
    renderWithFakeController({}, createConfig({ attributionText: '   ' }));
    expect(footer().textContent).not.toMatch(/Open-Meteo|GeoNames|CC BY/);
  });

  it('demo mode never claims Open-Meteo or GeoNames data, even if a credit text is configured', () => {
    const demo = composeDemo({ keyValueStore: new InMemoryKeyValueStore(), config: createConfig({ attributionText: CREDIT }) });
    render(<App store={demo.store} controller={demo.controller} config={demo.config} demo />);
    const text = footer().textContent ?? '';
    expect(text).toContain('Demo mode: the data shown is made-up sample data. It is not from Open-Meteo or GeoNames.');
    expect(within(footer()).queryByRole('link', { name: /Weather data by/ })).toBeNull();
    expect(within(footer()).queryByRole('link', { name: /GeoNames/ })).toBeNull();
    expect(links().map((l) => l.getAttribute('href'))).toEqual(['THIRD_PARTY_NOTICES.txt']);
    expect(text).not.toContain('Weather data by');
  });

  it('the not-set-up page shows no data and so no credit and no footer', () => {
    const none = compose({ keyValueStore: new InMemoryKeyValueStore() });
    render(<App store={none.store} controller={none.controller} config={createConfig({ attributionText: CREDIT })} unconfigured />);
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.queryByText(/Open-Meteo/)).toBeNull();
  });
});

describe('credit next to the data, inside the weather panels (Open-Meteo licence: "next to any location ... data are displayed")', () => {
  const region = (name: string) => screen.getByRole('region', { name });
  const panelCredits = (name: string) => within(region(name)).queryAllByRole('link', { name: /^Weather data by Open-Meteo\.com/ });
  const liveConfig = createConfig({ attributionText: CREDIT });

  async function showBerlin(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' }));
    await screen.findByText('Temperature');
    await waitFor(() => expect(region('Forecast').querySelectorAll('svg.weather-icon').length).toBe(3));
  }

  it('live mode: the Current weather card and the Forecast list each carry the linked credit, with the same safe attributes', async () => {
    renderLive();
    await showBerlin(userEvent.setup());
    for (const name of ['Current weather', 'Forecast']) {
      const found = panelCredits(name);
      expect(found, name).toHaveLength(1);
      const link = found[0] as HTMLElement;
      expect(link.getAttribute('href')).toBe('https://open-meteo.com/');
      expect(link.getAttribute('target')).toBe('_blank');
      expect((link.getAttribute('rel') ?? '').split(/\s+/).sort()).toEqual(['noopener', 'noreferrer']);
      expect(link.textContent).toBe('Weather data by Open-Meteo.com (opens in a new tab)');
      expect(link.classList.contains('footer-link')).toBe(true); // the 44 px minimum target rule
    }
    // The footer keeps its own full credit: three Open-Meteo links on the page, two in panels and one in the footer.
    const all = screen.getAllByRole('link').filter((l) => l.getAttribute('href') === 'https://open-meteo.com/');
    expect(all).toHaveLength(3);
    expect(within(footer()).getAllByRole('link').filter((l) => l.getAttribute('href') === 'https://open-meteo.com/')).toHaveLength(1);
  });

  it('the panel credit is not inside any live region (so it is never announced as a change), nor inside the footer', async () => {
    renderLive();
    await showBerlin(userEvent.setup());
    for (const name of ['Current weather', 'Forecast']) {
      const link = panelCredits(name)[0] as HTMLElement;
      expect(link.closest('[aria-live], [role="status"], [role="alert"], [aria-atomic]')).toBeNull();
      expect(link.closest('footer')).toBeNull();
      expect(region(name).querySelectorAll('[role="status"] a')).toHaveLength(0);
    }
  });

  it('keyboard: the credits are reached by Tab in reading order (current card, then forecast, then the footer)', async () => {
    const user = userEvent.setup();
    renderLive();
    await showBerlin(user);
    const current = panelCredits('Current weather')[0] as HTMLElement;
    current.focus();
    expect(document.activeElement).toBe(current);
    const stops: Element[] = [current];
    for (let i = 0; i < 12 && !stops.includes(panelCredits('Forecast')[0] as HTMLElement); i += 1) {
      await user.tab();
      stops.push(document.activeElement as Element);
    }
    expect(stops[stops.length - 1]).toBe(panelCredits('Forecast')[0]);
    expect(current.hasAttribute('tabindex')).toBe(false);
  });

  it('is absent before a place is chosen, while loading, and the card/list without data show no credit', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    renderLive(async (call) => {
      if (call.url.includes('forecast')) await gate;
      return route(call);
    });
    expect(screen.queryAllByRole('link', { name: /^Weather data by/ })).toHaveLength(1); // only the footer
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' }));
    await screen.findByText('Loading weather...');
    expect(panelCredits('Current weather')).toHaveLength(0);
    expect(panelCredits('Forecast')).toHaveLength(0);
    release?.();
    await screen.findByText('Temperature');
    await waitFor(() => expect(panelCredits('Forecast')).toHaveLength(1));
    expect(panelCredits('Current weather')).toHaveLength(1);
  });

  it('shows per section: a section that has no data (failed, nothing to show) has no credit while the other section keeps its own', () => {
    const failedSection = { status: 'error' as const, error: serviceUnavailable() };
    renderWithFakeController({ snapshot: { ...sampleSnapshot, current: failedSection } }, liveConfig);
    expect(panelCredits('Current weather')).toHaveLength(0);
    expect(panelCredits('Forecast')).toHaveLength(1);
    cleanup();
    renderWithFakeController({ snapshot: { ...sampleSnapshot, forecast: failedSection } }, liveConfig);
    expect(panelCredits('Current weather')).toHaveLength(1);
    expect(panelCredits('Forecast')).toHaveLength(0);
    cleanup();
    renderWithFakeController({ snapshot: { ...sampleSnapshot, forecast: { status: 'ready', data: [] } } }, liveConfig);
    expect(panelCredits('Forecast')).toHaveLength(0); // only "unavailable" rows: nothing real is displayed
  });

  it('stale data kept after a failed refresh is still data on screen, so the credit stays', () => {
    const stale = { ...sampleSnapshot.current, status: 'error' as const, error: serviceUnavailable() };
    renderWithFakeController({ snapshot: { ...sampleSnapshot, current: stale } }, liveConfig);
    expect(panelCredits('Current weather')).toHaveLength(1);
  });

  it('no credit text configured (fakes) means no panel credit even with weather shown', () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    expect(screen.getByText('Temperature')).toBeTruthy();
    expect(screen.queryAllByRole('link', { name: /Open-Meteo/ })).toHaveLength(0);
  });

  it('demo mode shows weather but no Open-Meteo link anywhere except the notices link in the footer', async () => {
    const user = userEvent.setup();
    const demo = composeDemo({ keyValueStore: new InMemoryKeyValueStore(), config: createConfig({ attributionText: CREDIT }) });
    render(<App store={demo.store} controller={demo.controller} config={demo.config} demo />);
    await user.type(screen.getByLabelText('City name'), 'Testville{Enter}');
    await screen.findByText('Temperature');
    await waitFor(() => expect(region('Forecast').querySelectorAll('svg.weather-icon').length).toBeGreaterThan(0));
    expect(panelCredits('Current weather')).toHaveLength(0);
    expect(panelCredits('Forecast')).toHaveLength(0);
    expect(screen.queryAllByRole('link').filter((l) => /open-meteo/i.test(l.getAttribute('href') ?? '') || /Open-Meteo/.test(l.textContent ?? ''))).toHaveLength(0);
  });

  it('the not-set-up page has no weather panels and so no credit', () => {
    const none = compose({ keyValueStore: new InMemoryKeyValueStore() });
    render(<App store={none.store} controller={none.controller} config={liveConfig} unconfigured />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('axe: weather shown with the panel credits has no violations', async () => {
    renderLive();
    await showBerlin(userEvent.setup());
    expect(panelCredits('Current weather')).toHaveLength(1);
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('splitAttribution', () => {
  const link = (phrase: string, href: string) => ({ phrase, href });
  it('keeps the text exactly: the segments always concatenate to the input', () => {
    for (const [text, ls] of [
      [CREDIT, [link('Weather data by Open-Meteo.com', 'a'), link('GeoNames', 'b')]],
      ['no phrase here', [link('GeoNames', 'b')]],
      ['', [link('GeoNames', 'b')]],
      ['GeoNames', [link('GeoNames', 'b')]],
      ['GeoNames GeoNames', [link('GeoNames', 'b')]],
      ['abc', [link('', 'x')]],
    ] as const) {
      expect(splitAttribution(text, ls).map((s) => s.text).join('')).toBe(text);
    }
  });

  it('links each phrase at its first occurrence, in text order', () => {
    expect(splitAttribution(CREDIT, [link('GeoNames', 'g'), link('Weather data by Open-Meteo.com', 'o')])).toEqual([
      { kind: 'link', text: 'Weather data by Open-Meteo.com', href: 'o' },
      { kind: 'text', text: '. Location data based on ' },
      { kind: 'link', text: 'GeoNames', href: 'g' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('a missing phrase is not linked and an overlapping one is skipped', () => {
    expect(splitAttribution('Open-Meteo.com data', [link('GeoNames', 'g')])).toEqual([{ kind: 'text', text: 'Open-Meteo.com data' }]);
    const overlapped = splitAttribution('abcdef', [link('abcd', '1'), link('cdef', '2')]);
    expect(overlapped.filter((s) => s.kind === 'link')).toHaveLength(1);
  });
});

describe('structure and accessibility (axe)', () => {
  async function violations(): Promise<string[]> {
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`);
  }

  it('live footer with weather shown, the icons and the links have no axe violations', async () => {
    const user = userEvent.setup();
    renderLive();
    await user.type(screen.getByLabelText('City name'), 'Berlin{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Berlin, State of Berlin, Germany' }));
    await screen.findByText('Temperature');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Forecast' }).querySelectorAll('svg.weather-icon').length).toBe(3));
    expect(await violations()).toEqual([]);
  });

  it('footer with no credit, and demo footer, have no axe violations', async () => {
    renderWithFakeController({ snapshot: sampleSnapshot });
    expect(await violations()).toEqual([]);
    cleanup();
    const demo = composeDemo({ keyValueStore: new InMemoryKeyValueStore() });
    render(<App store={demo.store} controller={demo.controller} config={demo.config} demo />);
    expect(await violations()).toEqual([]);
  });
});

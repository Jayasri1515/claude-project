/**
 * Release-build check in real browsers (Edge and Chrome via Playwright). Unlike the other specs, which run
 * the DEMO dev server, this one runs against `vite preview` of the plain release build (`npm run build:release`,
 * started by playwright.config.ts on its own port). Since TASK-037 the release build is the REAL app: it talks to
 * Open-Meteo. These tests never reach the live API: every request to the two Open-Meteo hosts is intercepted
 * with Playwright routes and answered from recorded responses (test/fixtures/openmeteo), and any other external
 * request fails the test.
 *
 * What it checks: the real app (not the "not set up" page, no demo content or notice) loads with no console
 * output, page error or failed request and with no external request before the user acts; a search, choice and
 * weather display work through the built bundle; the requests are HTTPS GETs to exactly the two documented hosts
 * with percent-encoded input and no key; provider failures show only fixed messages; over-long input is
 * refused locally; a device location (permission granted) shows weather without a named place and calls no
 * geocoding endpoint; nothing but the favorite is stored.
 *
 * Also checks the data-source credit footer (TASK-025: Open-Meteo, GeoNames, CC BY 4.0, notices link; link
 * attributes, target size and axe colour contrast) and the Lucide icons (TASK-035: one decorative icon per
 * condition row, only the icons used are in the bundle, the ISC notice file is served).
 *
 * Not covered: the live API in a browser (done once by hand, see impl-plan TASK-037) and other browsers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const GEOCODING = /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?/;
const FORECAST = /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/;
const OPEN_METEO_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com'];
const CORS = { 'access-control-allow-origin': '*' };
const AXE_PATH = fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url));

const fixture = (name: string): string => readFileSync(join(process.cwd(), 'test', 'fixtures', 'openmeteo', name), 'utf8');
const ok = (route: Route, body: string): Promise<void> =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body });

interface Watch {
  readonly external: string[];
  readonly failed: string[];
  readonly bad: string[];
  readonly consoleOutput: string[];
  readonly pageErrors: string[];
}

/** Records everything that should stay empty, plus every request that leaves the app origin. */
function watch(page: Page, origin: string): Watch {
  const w: Watch = { external: [], failed: [], bad: [], consoleOutput: [], pageErrors: [] };
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('data:') && new URL(u).origin !== origin) w.external.push(u);
  });
  page.on('requestfailed', (r) => w.failed.push(`${r.url()} (${r.failure()?.errorText ?? 'failed'})`));
  page.on('response', (r) => {
    if (r.status() >= 400) w.bad.push(`${r.status()} ${r.url()}`);
  });
  page.on('console', (m) => w.consoleOutput.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => w.pageErrors.push(e.message));
  return w;
}

/** Answers the two Open-Meteo APIs from the recordings. Any other external URL is aborted (and so fails the test). */
async function routeOpenMeteo(page: Page, origin: string, overrides: { geocoding?: (route: Route) => Promise<void> } = {}): Promise<void> {
  await page.route(GEOCODING, (route) => (overrides.geocoding ?? ((r: Route) => ok(r, fixture('geocoding-berlin.json'))))(route));
  await page.route(FORECAST, (route) => {
    const params = new URL(route.request().url()).searchParams;
    return ok(route, fixture(params.has('daily') ? 'forecast-daily.json' : 'forecast-current.json'));
  });
  await page.route((url) => url.origin !== origin && !GEOCODING.test(url.href) && !FORECAST.test(url.href) && !url.href.startsWith('data:'), (route) =>
    route.abort(),
  );
}

async function expectRealApp(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Weather' })).toBeVisible();
  await expect(page.getByLabel('City name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
  await expect(page.getByText('Weather is not set up yet')).toHaveCount(0);
}

test.describe('plain release build (vite preview), Open-Meteo intercepted', () => {
  test('loads the real app: no demo content, nothing external before the user acts, nothing stored, no console output', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const w = watch(page, origin);
    await routeOpenMeteo(page, origin);

    await page.goto('./');
    await expectRealApp(page);
    await page.waitForLoadState('networkidle');
    // M1: the live disclosure names what the weather service receives (and not the demo statement).
    await expect(page.getByText(/receives the text you search for.*your IP address, and may log requests/)).toBeVisible();

    // The page really is the release bundle, not a demo build served by mistake.
    expect(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /demo/i.test(n)))).toEqual([]);
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const word of ['demo', 'testville', 'sampleton', 'partialia', 'glitchton', 'made-up']) expect(bodyText, word).not.toContain(word);
    await expect(page.locator('.demo-notice, .demo-location-note')).toHaveCount(0);

    // No weather request until the user acts, and no storage is written by loading the page.
    expect(w.external, 'external requests before any user action').toEqual([]);
    const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }));
    expect(storage).toEqual({ local: 0, session: 0, cookie: '' });

    await page.reload();
    await expectRealApp(page);
    await page.waitForLoadState('networkidle');
    expect(w.external).toEqual([]);
    expect(w.failed, 'failed requests').toEqual([]);
    expect(w.bad, 'responses with status 400 or higher (a favicon 404 would be listed here)').toEqual([]);
    expect(w.pageErrors, 'page errors').toEqual([]);
    expect(w.consoleOutput, 'console output').toEqual([]);
  });

  test('search, choose, weather and a favorite work through the built bundle; requests are HTTPS GETs to the two documented hosts only', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const w = watch(page, origin);
    const methods: string[] = [];
    page.on('request', (r) => {
      if (OPEN_METEO_HOSTS.includes(new URL(r.url()).host)) methods.push(r.method());
    });
    await routeOpenMeteo(page, origin);

    await page.goto('./');
    await expectRealApp(page);
    await page.getByLabel('City name').fill('Berlin & co=1#x');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const chooser = page.getByRole('group', { name: /Several places match/ });
    await expect(chooser.getByRole('button')).toHaveCount(3);
    await chooser.getByRole('button', { name: 'Berlin, State of Berlin, Germany' }).click();

    const current = page.getByRole('region', { name: 'Current weather' });
    await expect(current.getByRole('heading', { name: 'Berlin, State of Berlin, Germany' })).toBeVisible();
    await expect(current.getByText('Temperature')).toBeVisible();
    await expect(current.getByText(/10°C/)).toBeVisible(); // recorded 9.5 C, shown to whole degrees
    await expect(current.getByText(/74%/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);

    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await expect(page.getByRole('region', { name: 'Favorites' }).getByRole('listitem')).toHaveCount(1);

    // Every external request: HTTPS, GET, one of the two hosts, no key, no credentials in the URL; the user's text is one encoded parameter.
    expect(w.external.length).toBeGreaterThanOrEqual(3);
    for (const raw of w.external) {
      const url = new URL(raw);
      expect(url.protocol, raw).toBe('https:');
      expect(OPEN_METEO_HOSTS, raw).toContain(url.host);
      expect(raw).not.toMatch(/api[_-]?key|apikey|token|secret/i);
      expect(url.username + url.password).toBe('');
    }
    expect(new Set(methods)).toEqual(new Set(['GET']));
    const search = w.external.map((u) => new URL(u)).find((u) => u.host === 'geocoding-api.open-meteo.com');
    expect(search?.searchParams.getAll('name')).toEqual(['Berlin & co=1#x']);
    expect([...(search?.searchParams.keys() ?? [])].sort()).toEqual(['count', 'format', 'language', 'name']);
    const forecastCalls = w.external.map((u) => new URL(u)).filter((u) => u.host === 'api.open-meteo.com');
    expect(forecastCalls.length).toBe(2);
    for (const u of forecastCalls) {
      expect(u.searchParams.get('timezone')).toBe('auto');
      // The place has 52.52437 / 13.41053; the request carries them rounded to 2 decimals (L2).
      expect(u.searchParams.get('latitude')).toBe('52.52');
      expect(u.searchParams.get('longitude')).toBe('13.41');
    }

    // Only the favorite is stored; the search text and the weather are not.
    const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    expect(Object.keys(stored)).toEqual(['weather-app.favorites']);
    expect(JSON.stringify(stored)).toContain('Berlin');
    expect(JSON.stringify(stored)).not.toContain('co=1');
    expect(JSON.stringify(stored)).not.toContain('Temperature');

    expect(w.failed).toEqual([]);
    expect(w.bad).toEqual([]);
    expect(w.pageErrors).toEqual([]);
    expect(w.consoleOutput).toEqual([]);
  });

  test('the credit footer is visible in every state, with the exact wording, safe links and 44 px targets (TASK-025)', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const w = watch(page, origin);
    await routeOpenMeteo(page, origin);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('./');
    await expectRealApp(page);

    const footer = page.getByRole('contentinfo');
    // The words a reader sees: the hidden "(opens in a new tab)" hints are for assistive technology only.
    const visibleParagraphs = () =>
      footer.evaluate((el) => {
        const copy = el.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('.visually-hidden').forEach((hint) => hint.remove());
        return Array.from(copy.querySelectorAll('p')).map((p) => p.textContent);
      });
    const expected = [
      'Weather data by Open-Meteo.com. Location data based on GeoNames.',
      'Data licence: CC BY 4.0. Changes: values are rounded and conditions are simplified.',
      'Third-party notices',
    ];

    // State 1: nothing chosen yet.
    await expect(footer).toBeVisible();
    expect(await visibleParagraphs()).toEqual(expected);

    // Links: exact targets, opening safely in a new tab, large enough to touch, inside the 320 px viewport.
    const links = await footer.getByRole('link').evaluateAll((anchors) =>
      anchors.map((a) => {
        const r = a.getBoundingClientRect();
        return { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), width: r.width, height: r.height, right: r.right };
      }),
    );
    expect(links.map((l) => l.href)).toEqual([
      'https://open-meteo.com/',
      'https://www.geonames.org/',
      'https://creativecommons.org/licenses/by/4.0/',
      'THIRD_PARTY_NOTICES.txt',
    ]);
    for (const l of links) {
      expect(l.target, l.href ?? '').toBe('_blank');
      expect((l.rel ?? '').split(/\s+/).sort(), l.href ?? '').toEqual(['noopener', 'noreferrer']);
      expect(l.height, `${l.href} height`).toBeGreaterThanOrEqual(43.5);
      expect(l.width, `${l.href} width`).toBeGreaterThanOrEqual(43.5);
      expect(l.right, `${l.href} inside the viewport`).toBeLessThanOrEqual(320.5);
    }

    // No weather is displayed yet, so the weather panels carry no credit of their own.
    await expect(page.locator('.panel-credit')).toHaveCount(0);

    // State 2: weather shown. State 3: a search error.
    await page.getByLabel('City name').fill('Berlin');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('group', { name: /Several places match/ }).getByRole('button', { name: 'Berlin, State of Berlin, Germany' }).click();
    await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
    await expect(footer).toBeVisible();
    expect(await visibleParagraphs()).toEqual(expected);

    // Next to the data: a short linked credit in the Current weather card and in the Forecast list (not in a live region).
    for (const name of ['Current weather', 'Forecast']) {
      const credit = page.getByRole('region', { name }).locator('.panel-credit');
      await expect(credit, name).toHaveCount(1);
      await expect(credit, name).toBeVisible();
      const link = credit.getByRole('link', { name: /^Weather data by Open-Meteo\.com/ });
      await expect(link, name).toHaveAttribute('href', 'https://open-meteo.com/');
      await expect(link, name).toHaveAttribute('target', '_blank');
      expect(((await link.getAttribute('rel')) ?? '').split(/\s+/).sort(), name).toEqual(['noopener', 'noreferrer']);
      expect(await credit.evaluate((el) => el.closest('[aria-live], [role="status"], [role="alert"]') === null), `${name}: outside live regions`).toBe(true);
      expect(await credit.evaluate((el) => (el.textContent ?? '').replace('(opens in a new tab)', '').trim()), name).toBe('Weather data by Open-Meteo.com');
      const box = await link.boundingBox();
      expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(43.5);
      expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(43.5);
      expect((box?.x ?? -1) + (box?.width ?? 0), `${name} inside the 320 px viewport`).toBeLessThanOrEqual(320.5);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'no horizontal scroll at 320 px').toBe(0);
    await page.getByLabel('City name').fill('x'.repeat(101));
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('That search is too long.')).toBeVisible();
    expect(await visibleParagraphs()).toEqual(expected);

    // No credit link was followed, and nothing else left the page.
    expect(w.external.every((u) => OPEN_METEO_HOSTS.includes(new URL(u).host))).toBe(true);
    expect(w.consoleOutput).toEqual([]);
    expect(w.pageErrors).toEqual([]);
  });

  test('layout: the credit beside the data stays inside its panel, below the data, with no horizontal scroll (320, 768 and 1280 px)', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    await routeOpenMeteo(page, origin);
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      await expectRealApp(page);
      await page.getByLabel('City name').fill('Berlin');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByRole('group', { name: /Several places match/ }).getByRole('button', { name: 'Berlin, State of Berlin, Germany' }).click();
      await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
      await expect(page.locator('.panel-credit')).toHaveCount(2);
      const geometry = await page.evaluate(() => {
        const rect = (el: Element) => el.getBoundingClientRect();
        return ['.panel-current', '.panel-forecast'].map((selector) => {
          const panel = document.querySelector(selector) as HTMLElement;
          const credit = panel.querySelector('.panel-credit') as HTMLElement;
          const link = credit.querySelector('a') as HTMLElement;
          const lastData = panel.querySelector('dl.values, ol.forecast-list') as HTMLElement;
          return {
            selector,
            panelLeft: rect(panel).left,
            panelRight: rect(panel).right,
            linkLeft: rect(link).left,
            linkRight: rect(link).right,
            linkHeight: rect(link).height,
            creditTop: rect(credit).top,
            dataBottom: rect(lastData).bottom,
          };
        });
      });
      for (const g of geometry) {
        expect(g.linkLeft, `${width}px ${g.selector} left`).toBeGreaterThanOrEqual(g.panelLeft - 0.5);
        expect(g.linkRight, `${width}px ${g.selector} right`).toBeLessThanOrEqual(g.panelRight + 0.5);
        expect(g.linkRight, `${width}px ${g.selector} inside the viewport`).toBeLessThanOrEqual(width + 0.5);
        expect(g.linkHeight, `${width}px ${g.selector} touch target`).toBeGreaterThanOrEqual(43.5);
        expect(g.creditTop, `${width}px ${g.selector} sits after the data`).toBeGreaterThanOrEqual(g.dataBottom - 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px overflow`).toBe(0);
    }
  });

  test('axe finds no WCAG 2.1 A/AA violation, colour contrast included, with weather, icons and the footer shown (320 and 1280 px)', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    await routeOpenMeteo(page, origin);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      await expectRealApp(page);
      await page.getByLabel('City name').fill('Berlin');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByRole('group', { name: /Several places match/ }).getByRole('button', { name: 'Berlin, State of Berlin, Germany' }).click();
      await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
      await expect(page.locator('svg.weather-icon')).toHaveCount(4); // current weather + 3 forecast days
      await expect(page.locator('.panel-credit a')).toHaveCount(2); // the credit beside the data is part of what axe checks

      if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE_PATH });
      const results = await page.evaluate(async () => {
        interface Axe {
          run(
            context: Document,
            options: unknown,
          ): Promise<{
            violations: Array<{ id: string; nodes: Array<{ html: string }> }>;
            passes: Array<{ id: string; nodes: unknown[] }>;
            incomplete: Array<{ id: string }>;
          }>;
        }
        const axe = (window as unknown as { axe: Axe }).axe;
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return {
          violations: r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`),
          contrastChecked: r.passes.find((p) => p.id === 'color-contrast')?.nodes.length ?? 0,
          incomplete: r.incomplete.map((i) => i.id),
        };
      });
      expect(results.violations, `${width}px`).toEqual([]);
      expect(results.contrastChecked, `${width}px: contrast really evaluated`).toBeGreaterThan(5);
      expect(results.incomplete, `${width}px: nothing left for a human to decide`).toEqual([]);
    }
  });

  test('icons: one decorative Lucide icon beside each condition text; the notice file is served; only the used icons are bundled (TASK-035)', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    await routeOpenMeteo(page, origin);
    await page.goto('./');
    await expectRealApp(page);
    await page.getByLabel('City name').fill('Berlin');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('group', { name: /Several places match/ }).getByRole('button', { name: 'Berlin, State of Berlin, Germany' }).click();
    await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);

    const icons = await page.locator('.condition').evaluateAll((els) =>
      els.map((el) => {
        const svg = el.querySelector('svg');
        const r = svg?.getBoundingClientRect();
        return {
          text: el.textContent?.trim() ?? '',
          hidden: svg?.getAttribute('aria-hidden') ?? null,
          role: svg?.getAttribute('role') ?? null,
          key: svg?.getAttribute('data-icon-key') ?? null,
          width: r?.width ?? 0,
          height: r?.height ?? 0,
        };
      }),
    );
    expect(icons).toHaveLength(4);
    for (const i of icons) {
      expect(i.text.length, 'the condition text is shown, not just the icon').toBeGreaterThan(0);
      expect(i.hidden).toBe('true');
      expect(i.role).toBeNull();
      expect(i.key).toBeTruthy();
      expect(i.width).toBeGreaterThan(10);
      expect(i.height).toBeGreaterThan(10);
    }

    const notices = await page.request.get('./THIRD_PARTY_NOTICES.txt');
    expect(notices.status()).toBe(200);
    const noticeText = await notices.text();
    expect(noticeText).toContain('ISC License');
    expect(noticeText).toContain('lucide-react');
    expect(noticeText).toContain('Weather data by Open-Meteo.com');
    for (const pkg of ['react', 'react-dom', 'scheduler']) expect(noticeText, pkg).toMatch(new RegExp(`Package:  ${pkg}\\r?\\n`));
    expect(noticeText).toContain('MIT License');
    expect(noticeText).toContain('Copyright (c) Meta Platforms, Inc. and affiliates.');

    const scriptUrl = await page.evaluate(() => (Array.from(document.scripts).find((s) => /\.js$/.test(s.src)) as HTMLScriptElement).src);
    const bundle = await (await page.request.get(scriptUrl)).text();
    const defined = new Set([...bundle.matchAll(/name:[`"']([a-z0-9-]+)[`"'],size:24,node:\[/g)].map((m) => m[1]));
    expect([...defined].sort()).toEqual(['circle-question-mark', 'cloud', 'cloud-fog', 'cloud-lightning', 'cloud-rain', 'cloud-snow', 'cloud-sun', 'sun']);
  });

  test('over-long input is refused with its own message and sends no request (C2)', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const w = watch(page, origin);
    await routeOpenMeteo(page, origin);
    await page.goto('./');
    await page.getByLabel('City name').fill('x'.repeat(101));
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('That search is too long. Please enter a shorter city name.')).toBeVisible();
    await expect(page.getByText(/City not found/)).toHaveCount(0);
    expect(w.external).toEqual([]);
  });

  test('a provider error shows only the fixed message, never provider text', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const w = watch(page, origin);
    await routeOpenMeteo(page, origin, {
      geocoding: (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', headers: CORS, body: '{"error":true,"reason":"SECRET-PROVIDER-TEXT"}' }),
    });
    await page.goto('./');
    await page.getByLabel('City name').fill('Berlin');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(/weather service is unavailable/)).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('SECRET-PROVIDER-TEXT');
    expect(w.external).toHaveLength(1);
  });

  test('a provider that cannot be reached (network error) shows the fixed message and the search stays usable', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    await routeOpenMeteo(page, origin, { geocoding: (route) => route.abort('internetdisconnected') });
    await page.goto('./');
    await page.getByLabel('City name').fill('Berlin');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(/weather service is unavailable/)).toBeVisible();
    await expect(page.getByLabel('City name')).toBeEnabled();
  });

  test('the favicon is declared inline, so the browser does not request /favicon.ico', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, new URL(baseURL ?? 'http://localhost').origin);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto('./');
    await expectRealApp(page);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'data:,');
    await page.waitForLoadState('networkidle');
    expect(requests).not.toContain('/favicon.ico');
    expect(requests).not.toContain('/claude-project/favicon.ico');
  });

  test('the app is served under /claude-project/ (GitHub Pages project-site path): assets, notices link and the page itself resolve there', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    expect(new URL(baseURL ?? '').pathname).toBe('/claude-project/');
    const w = watch(page, origin);
    await routeOpenMeteo(page, origin);
    const sameOrigin: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).origin === origin) sameOrigin.push(new URL(r.url()).pathname);
    });
    await page.goto('./');
    await expectRealApp(page);
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe('/claude-project/');

    // Every same-origin request (page, script, stylesheet) is under the base: nothing is requested from the site root.
    expect(sameOrigin.length).toBeGreaterThanOrEqual(3);
    for (const p of sameOrigin) expect(p, 'same-origin request outside the base').toMatch(/^\/claude-project\//);
    expect(sameOrigin.some((p) => /^\/claude-project\/assets\/.+\.js$/.test(p))).toBe(true);
    expect(sameOrigin.some((p) => /^\/claude-project\/assets\/.+\.css$/.test(p))).toBe(true);

    // The footer's notices link is relative, and it resolves to the file under the base.
    const href = await page.getByRole('link', { name: /Third-party notices/ }).getAttribute('href');
    expect(href).toBe('THIRD_PARTY_NOTICES.txt');
    const resolved = new URL(href ?? '', page.url());
    expect(resolved.pathname).toBe('/claude-project/THIRD_PARTY_NOTICES.txt');
    const notices = await page.request.get(resolved.href);
    expect(notices.status()).toBe(200);
    expect(await notices.text()).toContain('Package:  lucide-react');

    expect(w.failed).toEqual([]);
    expect(w.bad).toEqual([]);
    expect(w.pageErrors).toEqual([]);
    expect(w.consoleOutput).toEqual([]);
  });

  test('requests to the weather service carry no Referer (referrerPolicy no-referrer) and no custom headers; a plain fetch would carry the page origin', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    await routeOpenMeteo(page, origin);
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    page.on('request', (r) => {
      if (OPEN_METEO_HOSTS.includes(new URL(r.url()).host)) seen.push({ url: r.url(), headers: r.headers() });
    });
    await page.goto('./');
    await expectRealApp(page);
    await page.getByLabel('City name').fill('Berlin');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('group', { name: /Several places match/ }).getByRole('button', { name: 'Berlin, State of Berlin, Germany' }).click();
    await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
    const fromApp = seen.splice(0);
    expect(fromApp.length).toBeGreaterThanOrEqual(3);
    for (const call of fromApp) {
      expect(call.headers['referer'], `Referer on ${call.url}`).toBeUndefined();
      // No header that would force a CORS preflight: only the browser's own defaults are present.
      const custom = Object.keys(call.headers).filter(
        (h) => !['accept', 'accept-language', 'accept-encoding', 'user-agent', 'origin', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'referer'].includes(h.toLowerCase()),
      );
      expect(custom, `unexpected request headers on ${call.url}`).toEqual([]);
    }
    // Control: the same kind of request WITHOUT the policy does carry the page origin, so the check above can fail.
    await page.evaluate(() => fetch('https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=1&language=en&format=json').then((r) => r.text()));
    expect(seen.length).toBe(1);
    expect(seen[0]?.headers['referer']).toBe(new URL(page.url()).origin + '/'); // the default policy sends the page origin
  });

  test('every script and stylesheet the page loads is free of demo code and demo place names', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, new URL(baseURL ?? 'http://localhost').origin);
    const assets: string[] = [];
    page.on('response', (r) => {
      if (/\.(js|css)(\?|$)/.test(r.url())) assets.push(r.url());
    });
    await page.goto('./');
    await expectRealApp(page);
    await page.waitForLoadState('networkidle');
    expect(assets.length).toBeGreaterThan(1); // the script and the stylesheet
    for (const url of assets) {
      const body = await (await page.request.get(url)).text();
      expect(body.length, url).toBeGreaterThan(100);
      for (const marker of ['composeDemo', 'DemoWeatherProvider', 'PrefixedKeyValueStore', 'Testville', 'Sampleton', 'Partialia', 'Glitchton']) {
        expect(body, `${url} contains ${marker}`).not.toContain(marker);
      }
    }
  });
});

test.describe('plain release build: device location with permission already granted (no reverse geocoding)', () => {
  test.use({ geolocation: { latitude: 12.3456, longitude: -77.2549 }, permissions: ['geolocation'] });

  test('weather shows without a named place, only the forecast host is called, nothing is favoritable or stored', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const w = watch(page, origin);
    await routeOpenMeteo(page, origin);
    await page.goto('./');

    const current = page.getByRole('region', { name: 'Current weather' });
    await expect(current.getByRole('heading', { name: 'Current location' })).toBeVisible();
    await expect(current.getByText('Temperature')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);

    expect(w.external.length).toBeGreaterThan(0);
    for (const raw of w.external) {
      const url = new URL(raw);
      expect(url.host, raw).toBe('api.open-meteo.com'); // never the geocoding host: no search and no reverse lookup
      expect(raw).not.toMatch(/reverse/i);
      // The device position (12.3456, -77.2549) leaves the page only rounded to 2 decimals (L2).
      const params = url.searchParams;
      expect([params.get('latitude'), params.get('longitude')], raw).toEqual(['12.35', '-77.25']);
    }
    await expect(page.getByRole('button', { name: 'Add to favorites' })).toHaveCount(0);
    await expect(page.getByText('Search for the city by name to save it as a favorite.')).toBeVisible();
    const stored = await page.evaluate(() => ({ local: Object.keys(localStorage), cookie: document.cookie }));
    expect(stored).toEqual({ local: [], cookie: '' });
    expect(w.failed).toEqual([]);
    expect(w.pageErrors).toEqual([]);
    expect(w.consoleOutput).toEqual([]);
  });
});

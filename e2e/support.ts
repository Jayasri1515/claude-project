/**
 * Helpers shared by the browser specs (release.spec.ts, accessibility.spec.ts, layout.spec.ts, browserApis.spec.ts):
 * recorded Open-Meteo answers through Playwright routes, a recorder of requests and console output, and axe.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

export const GEOCODING = /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?/;
export const FORECAST = /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/;
export const OPEN_METEO_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com'];
export const CORS = { 'access-control-allow-origin': '*' };
export const AXE_PATH = fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url));
const AXE_SOURCE = readFileSync(AXE_PATH, 'utf8');

export const fixture = (name: string): string => readFileSync(join(process.cwd(), 'test', 'fixtures', 'openmeteo', name), 'utf8');
export const ok = (route: Route, body: string): Promise<void> =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body });

export interface Watch {
  readonly external: string[];
  readonly failed: string[];
  readonly bad: string[];
  readonly consoleOutput: string[];
  readonly pageErrors: string[];
}

/** Records everything that should stay empty, plus every request that leaves the app origin. */
export function watch(page: Page, origin: string): Watch {
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
export async function routeOpenMeteo(page: Page, origin: string, overrides: { geocoding?: (route: Route) => Promise<void> } = {}): Promise<void> {
  await page.route(GEOCODING, (route) => (overrides.geocoding ?? ((r: Route) => ok(r, fixture('geocoding-berlin.json'))))(route));
  await page.route(FORECAST, (route) => {
    const params = new URL(route.request().url()).searchParams;
    return ok(route, fixture(params.has('daily') ? 'forecast-daily.json' : 'forecast-current.json'));
  });
  await page.route((url) => url.origin !== origin && !GEOCODING.test(url.href) && !FORECAST.test(url.href) && !url.href.startsWith('data:'), (route) =>
    route.abort(),
  );
}

export async function expectRealApp(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Weather' })).toBeVisible();
  await expect(page.getByLabel('City name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
  await expect(page.getByText('Weather is not set up yet')).toHaveCount(0);
}


export const BERLIN = 'Berlin, State of Berlin, Germany';

/** Types a city, searches, and returns the pick list (the recorded geocoding answer has three Berlins). */
export async function searchBerlin(page: Page): Promise<void> {
  await page.getByLabel('City name').fill('Berlin');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

/** Searches Berlin, picks the first place, and waits until current weather and the 3-day forecast are shown. */
export async function showBerlinWeather(page: Page): Promise<void> {
  await searchBerlin(page);
  await page.getByRole('group', { name: /Several places match/ }).getByRole('button', { name: BERLIN }).click();
  await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
}

/**
 * Stops the page asking for the device position when it opens, so a test starts from the plain "search" state:
 * the Permissions API says "denied" without a prompt, and the position call fails with PERMISSION_DENIED.
 */
export async function denyDeviceLocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const denied = { code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => setTimeout(() => fail(denied), 0) },
    });
  });
}

/** A geolocation that never answers (permission prompt left open), as in release.spec.ts. */
export async function pendingDeviceLocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: () => Promise.resolve({ state: 'prompt', addEventListener: () => undefined, removeEventListener: () => undefined }) },
    });
  });
}

export interface AxeSummary {
  readonly violations: string[];
  readonly incomplete: string[];
  readonly contrastChecked: number;
}

/** Runs axe-core (WCAG 2.0/2.1 A and AA, colour contrast included) on the current page. */
export async function injectAxe(page: Page): Promise<void> {
  // page.evaluate runs through the debugging protocol, which the page's CSP does not block (addScriptTag would be:
  // it adds an inline script, which `script-src 'self'` forbids).
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE_SOURCE);
}

export async function runAxe(page: Page): Promise<AxeSummary> {
  await injectAxe(page);
  return page.evaluate(async () => {
    interface Axe {
      run(
        context: Document,
        options: unknown,
      ): Promise<{
        violations: Array<{ id: string; impact?: string; nodes: Array<{ html: string }> }>;
        passes: Array<{ id: string; nodes: unknown[] }>;
        incomplete: Array<{ id: string; nodes: Array<{ html: string }> }>;
      }>;
    }
    const axe = (window as unknown as { axe: Axe }).axe;
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return {
      violations: r.violations.map((v) => `${v.id} (${v.impact ?? '?'}): ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`),
      incomplete: r.incomplete.map((i) => `${i.id}: ${i.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`),
      contrastChecked: r.passes.find((p) => p.id === 'color-contrast')?.nodes.length ?? 0,
    };
  });
}

/** Asserts that a page state has no axe violation and nothing left undecided. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const r = await runAxe(page);
  expect(r.violations, `${label}: axe violations`).toEqual([]);
  expect(r.incomplete, `${label}: axe left for a human`).toEqual([]);
}

/** Asserts there is no horizontal scrolling. */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow in px`).toBeLessThanOrEqual(0);
}

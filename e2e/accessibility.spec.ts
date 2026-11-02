/**
 * Accessibility in real browsers, on the RELEASE build (impl-plan T-62, REQ-WF7-01, REQ-WF7-06).
 * axe-core with the WCAG 2.0/2.1 A and AA rule sets, colour contrast included, in every main state, at 320 and
 * 1280 px: initial (device location waiting), initial with the location refused, empty-input error, searching
 * (request in flight), pick list, city not found, service unavailable, weather shown, favorites (one saved), unreadable
 * saved favorites, favorites storage unavailable. A violation or an axe result left "for a human" fails the test.
 * Also a keyboard-only search and the focus order of the controls.
 *
 * What this does not cover (T-71, T-72 are manual): screen reader output, 200% zoom, real devices. axe finds only
 * part of the possible problems; a pass here is partial evidence (impl-plan T-62).
 */
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import {
  CORS,
  denyDeviceLocation,
  expectAccessible,
  expectRealApp,
  fixture,
  pendingDeviceLocation,
  routeOpenMeteo,
  runAxe,
  searchBerlin,
  showBerlinWeather,
} from './support';

const WIDTHS = [320, 1280] as const;
const FAVORITES_KEY = 'weather-app.favorites';

async function open(page: Page, baseURL: string | undefined, width: number, overrides: Parameters<typeof routeOpenMeteo>[2] = {}): Promise<void> {
  await routeOpenMeteo(page, new URL(baseURL ?? 'http://localhost').origin, overrides);
  await page.setViewportSize({ width, height: 900 });
}

for (const width of WIDTHS) {
  test.describe(`axe, release build, ${width}px`, () => {
    test('initial state with the device location waiting for the browser prompt', async ({ page, baseURL }) => {
      await open(page, baseURL, width);
      await pendingDeviceLocation(page);
      await page.goto('./');
      await expectRealApp(page);
      await expect(page.getByRole('region', { name: 'Status' }).getByText('Detecting your location...')).toBeVisible();
      await expectAccessible(page, 'location waiting');
      const r = await runAxe(page);
      expect(r.contrastChecked, 'contrast really evaluated').toBeGreaterThan(3);
    });

    test('initial state with the location refused (error message shown) and the empty-input error', async ({ page, baseURL }) => {
      await open(page, baseURL, width);
      await denyDeviceLocation(page);
      await page.goto('./');
      await expectRealApp(page);
      await expect(page.getByText('Location access is turned off for this site.')).toBeVisible();
      await expectAccessible(page, 'location denied');

      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.getByText('Please enter a city name.')).toBeVisible();
      await expectAccessible(page, 'empty input error');
    });

    test('searching (request in flight), pick list, and city not found', async ({ page, baseURL }) => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let answer = 'geocoding-berlin.json';
      await open(page, baseURL, width, {
        geocoding: async (route: Route) => {
          await gate;
          await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: fixture(answer) });
        },
      });
      await denyDeviceLocation(page);
      await page.goto('./');
      await expectRealApp(page);

      await searchBerlin(page);
      await expect(page.getByText(/Searching/i).first()).toBeVisible();
      await expectAccessible(page, 'searching');
      release();

      const chooser = page.getByRole('group', { name: /Several places match/ });
      await expect(chooser.getByRole('button')).toHaveCount(3);
      await expectAccessible(page, 'pick list');

      answer = 'geocoding-no-results.json';
      await page.getByLabel('City name').fill('Qwertyzzz');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.getByText('No matching city was found. Try a different name.')).toBeVisible();
      await expectAccessible(page, 'city not found');
    });

    test('service unavailable and input-too-long messages', async ({ page, baseURL }) => {
      await open(page, baseURL, width, {
        geocoding: (route: Route) =>
          route.fulfill({ status: 503, contentType: 'application/json', headers: CORS, body: '{"error":true,"reason":"x"}' }),
      });
      await denyDeviceLocation(page);
      await page.goto('./');
      await searchBerlin(page);
      await expect(page.getByText(/weather service is unavailable/)).toBeVisible();
      await expectAccessible(page, 'service unavailable');

      // Over-long input has its own message.
      await page.getByLabel('City name').fill('x'.repeat(101));
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.getByText('That search is too long.')).toBeVisible();
      await expectAccessible(page, 'input too long');
    });

    test('weather shown, then favorites with one saved city', async ({ page, baseURL }) => {
      await open(page, baseURL, width);
      await denyDeviceLocation(page);
      await page.goto('./');
      await expectRealApp(page);
      await showBerlinWeather(page);
      await expect(page.locator('svg.weather-icon')).toHaveCount(4);
      await expectAccessible(page, 'weather shown');
      const r = await runAxe(page);
      expect(r.contrastChecked, 'contrast really evaluated').toBeGreaterThan(5);

      await page.getByRole('button', { name: 'Add to favorites' }).click();
      const favorites = page.getByRole('region', { name: 'Favorites' });
      await expect(favorites.getByRole('listitem')).toHaveCount(1);
      await expectAccessible(page, 'favorites with one city');

      await page.reload();
      await expect(favorites.getByRole('listitem')).toHaveCount(1);
      await expectAccessible(page, 'favorites restored after reload');
    });

    test('weather from the device location (granted) and the favorites messages for unreadable and unavailable storage', async ({ page, baseURL, context }) => {
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 12.3456, longitude: -77.2549 });
      await open(page, baseURL, width);
      await page.goto('./');
      await expect(page.getByRole('region', { name: 'Current weather' }).getByRole('heading', { name: 'Current location' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
      await expectAccessible(page, 'device location weather');

      // Unreadable saved favorites: the app clears them and says so.
      await page.evaluate((key) => localStorage.setItem(key, '{not json'), FAVORITES_KEY);
      await page.reload();
      await expect(page.getByText('Your saved favorites could not be read and were cleared.')).toBeVisible();
      await expectAccessible(page, 'favorites corrupted message');
    });

    test('favorites storage unavailable message', async ({ page, baseURL }) => {
      await open(page, baseURL, width);
      await denyDeviceLocation(page);
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('denied', 'SecurityError');
          },
        });
      });
      await page.goto('./');
      await expectRealApp(page);
      await showBerlinWeather(page);
      await page.getByRole('button', { name: 'Add to favorites' }).click();
      await expect(page.getByText('Favorites cannot be saved on this device.').first()).toBeVisible();
      await expectAccessible(page, 'storage unavailable');
    });
  });
}

test.describe('keyboard', () => {
  test('a keyboard-only search: tab to the field, type, Enter, choose a place with Enter; every stop has a visible focus indicator', async ({ page, baseURL, browserName }) => {
    await open(page, baseURL, 1280);
    await denyDeviceLocation(page);
    await page.goto('./');
    await expectRealApp(page);

    await page.getByLabel('City name').focus();
    await page.keyboard.type('Berlin');
    await page.keyboard.press('Enter');
    const chooser = page.getByRole('group', { name: /Several places match/ });
    await expect(chooser.getByRole('button')).toHaveCount(3);
    await chooser.getByRole('button').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);

    // Walk the tab order from the top of the page: every stop the keyboard reaches shows an outline or ring.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const problems: string[] = [];
    const stops = new Set<string>();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (el === null || el === document.body) return { id: '', problem: '' };
        const seen = ((window as unknown as { __seen?: Set<Element> }).__seen ??= new Set<Element>());
        const isNew = !seen.has(el);
        seen.add(el);
        const style = getComputedStyle(el);
        const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
        const hasShadow = style.boxShadow !== 'none';
        const id = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 25)}"`;
        return { id: isNew ? id : '', problem: hasOutline || hasShadow ? '' : `${id} has outline ${style.outlineStyle} ${style.outlineWidth}` };
      });
      if (stop.id !== '') stops.add(`${stops.size}:${stop.id}`);
      if (stop.problem !== '') problems.push(`${browserName}: ${stop.problem}`);
    }
    // Safari's Tab skips links unless a system option is set, so WebKit reaches fewer stops than the other engines.
    expect(stops.size, 'tab stops reached').toBeGreaterThanOrEqual(browserName === 'webkit' ? 4 : 8);
    const unfocusable = problems;
    expect(unfocusable).toEqual([]);
  });
});

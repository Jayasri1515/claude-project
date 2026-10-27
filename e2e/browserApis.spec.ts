/**
 * TASK-040 / TASK-041 / TASK-021 / TASK-020 in real browsers (Edge and Chrome via Playwright):
 * real localStorage persistence across a reload, blocked storage, the real Geolocation adapter,
 * what is stored, and what the page sends over the network.
 *
 * Limits: Geolocation permission is granted or left ungranted by the automation, so a HUMAN
 * answering (or ignoring) the browser's permission prompt is NOT covered; the Permissions API
 * is exercised only in Chromium-based browsers; Firefox and Safari are not covered.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const FAV_KEY = 'demo:weather-app.favorites';
const SETTINGS_KEY = 'demo:weather-app.settings';

async function searchAndFavorite(page: Page, text: string): Promise<void> {
  await page.getByLabel('City name').fill(text);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Add to favorites' }).click();
  await expect(page.getByRole('region', { name: 'Favorites' }).getByRole('listitem')).toHaveCount(1);
}

test.describe('real localStorage (demo mode, keys prefixed "demo:")', () => {
  test('AC-006-6 / AC-P-05: a favorite and the unit survive a real reload; removal survives too', async ({ page }) => {
    await page.goto('/');
    await searchAndFavorite(page, 'TESTvilLE'); // typed in odd case on purpose
    await page.getByRole('radio', { name: '°F' }).check();
    await page.reload();
    const favorites = page.getByRole('region', { name: 'Favorites' });
    await expect(favorites.getByRole('button', { name: 'Show weather for Testville, Testshire, Testland' })).toBeVisible();
    await expect(page.getByRole('radio', { name: '°F' })).toBeChecked();

    // Selecting the saved favorite shows weather without typing a search.
    await favorites.getByRole('button', { name: /Show weather for Testville/ }).click();
    await expect(page.getByRole('region', { name: 'Current weather' }).getByText(/°F/).first()).toBeVisible({ timeout: 10_000 });

    await favorites.getByRole('button', { name: /Remove Testville/ }).click();
    await expect(favorites.getByText('No favorites yet.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Favorites' }).getByText('No favorites yet.')).toBeVisible();
  });

  test('NFR-005: what is stored is only the favorite and the unit, never the search text', async ({ page }) => {
    await page.goto('/');
    await searchAndFavorite(page, 'TESTvilLE');
    await page.getByLabel('City name').fill('Qx7-NOT-A-CITY');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(/City not found/)).toBeVisible();
    await page.getByRole('radio', { name: '°F' }).check();

    const dump = await page.evaluate(() => ({
      local: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
      session: Object.keys(sessionStorage),
      cookie: document.cookie,
      url: location.href,
    }));
    expect(Object.keys(dump.local).sort()).toEqual([FAV_KEY, SETTINGS_KEY]);
    const all = JSON.stringify(dump);
    expect(all).toContain('Testville');
    expect(all).not.toContain('TESTvilLE');
    expect(all).not.toContain('Qx7-NOT-A-CITY');
    expect(dump.session).toEqual([]);
    expect(dump.cookie).toBe('');
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(async () => (await indexedDB.databases?.())?.length ?? 0)).toBe(0);
  });

  test('EC-016: with localStorage blocked the app still works and shows a non-blocking notice', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked for test', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    const favorites = page.getByRole('region', { name: 'Favorites' });
    await expect(favorites.getByText('Favorites may not be saved on this device.')).toBeVisible();
    await page.getByLabel('City name').fill('Testville');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Current weather' }).getByText('Temperature')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await expect(favorites.getByRole('listitem')).toHaveCount(1); // kept for the session
    await expect(page.getByLabel('City name')).toBeEnabled();
  });

  test('EC-016: with writes failing (quota) the favorite is kept for the session with a notice', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    await page.goto('/');
    await searchAndFavorite(page, 'Testville');
    await expect(page.getByRole('region', { name: 'Favorites' }).getByText('Favorites may not be saved on this device.')).toBeVisible();
  });
});

test.describe('network and console', () => {
  test('a full demo session makes requests only to the app origin, and logs nothing', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const external: string[] = [];
    const consoleOutput: string[] = [];
    const pageErrors: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('data:') && !r.url().startsWith('blob:') && new URL(r.url()).origin !== origin) external.push(r.url());
    });
    page.on('console', (m) => {
      // Allowed: the Vite dev server banner and React's dev-mode DevTools hint (both from libraries, dev server only).
      const text = m.text();
      if (!text.startsWith('[vite]') && !text.includes('Download the React DevTools')) consoleOutput.push(`${m.type()}: ${text}`);
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/');
    await searchAndFavorite(page, 'Testville');
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.getByText(/could not be determined/)).toBeVisible();
    await page.getByLabel('City name').fill('error');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(/weather service is unavailable/)).toBeVisible();
    await page.reload();

    expect(external).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleOutput).toEqual([]);
  });
});

test.describe('real Geolocation adapter (harness: live mode, real BrowserLocationService, invented data)', () => {
  const adapter = (page: Page) =>
    page.evaluate(async () => {
      type Svc = { getPermissionState(): Promise<string>; getCurrentPosition(t: number, s: AbortSignal): Promise<unknown> };
      const h = (window as unknown as { __harness: { BrowserLocationService: new () => Svc } }).__harness;
      const svc = new h.BrowserLocationService();
      return { state: await svc.getPermissionState(), position: await svc.getCurrentPosition(4000, new AbortController().signal) };
    });

  test('permission granted: state is "granted" and the position is returned in the port shape', async ({ browser }) => {
    const ctx = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 12.34, longitude: 56.78 } });
    const page = await ctx.newPage();
    await page.goto('/e2e/harness.html');
    expect(await adapter(page)).toEqual({ state: 'granted', position: { ok: true, value: { lat: 12.34, lon: 56.78 } } });
    await ctx.close();
  });

  test('permission not granted: state is "prompt" and a refused request maps to LOCATION_DENIED (no throw)', async ({ page }) => {
    await page.goto('/e2e/harness.html');
    const result = await adapter(page);
    expect(result.state).toBe('prompt');
    expect(result.position).toEqual({ ok: false, error: { code: 'LOCATION_DENIED', messageKey: 'error.locationDenied' } });
  });

  test('Geolocation missing: state is "unsupported" and the request fails with a typed error', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    });
    await page.goto('/e2e/harness.html');
    const result = await adapter(page);
    expect(result.state).toBe('unsupported');
    expect((result.position as { ok: boolean }).ok).toBe(false);
  });

  test('Permissions API missing: the adapter falls back to "prompt" (portability rule, F-009)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
    });
    await page.goto('/e2e/harness.html');
    expect((await adapter(page)).state).toBe('prompt');
  });

  test('AC-002-1 / AC-002-5: granted at launch: the app finds the position and shows weather without a click', async ({ browser }) => {
    const ctx = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 12.34, longitude: 56.78 } });
    const page = await ctx.newPage();
    await page.goto('/e2e/harness.html?start=1');
    await expect(page.getByRole('heading', { level: 3, name: 'Current location' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3, { timeout: 10_000 });
    // Privacy: the coordinates were not written anywhere.
    const dump = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage, c: document.cookie }));
    expect(dump).not.toContain('12.34');
    expect(dump).not.toContain('56.78');
    await ctx.close();
  });

  test('AC-002-2 / AC-002-3: not granted: nothing asks at launch; the click is refused; message shown and city search still works', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __geoCalls: number };
      w.__geoCalls = 0;
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args: Parameters<Geolocation['getCurrentPosition']>) => {
        w.__geoCalls += 1;
        return original(...args);
      };
    });
    await page.goto('/e2e/harness.html?start=1');
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
    // Wait for a condition, not for time: start() has finished, so any launch-time location request would have been made.
    await page.evaluate(() => (window as unknown as { __harness: { started: Promise<void> } }).__harness.started);
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);

    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.getByText(/Location access was denied/)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);

    await page.getByLabel('City name').fill('Testville');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Testville, Testshire, Testland' })).toBeVisible({ timeout: 10_000 });
  });
});

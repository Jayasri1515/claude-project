/**
 * Browser APIs in real browsers, on the RELEASE build (impl-plan T-61 device location and storage scenarios, T-64
 * storage content): geolocation granted, refused, unavailable, unsupported and prompt-pending; localStorage missing
 * (reading it throws), failing on write, and holding an unreadable favorites record; favorites surviving a reload.
 * Open-Meteo is answered from recordings (e2e/support.ts). "Granted" uses the engine's own permission and position
 * (Playwright context options); the other geolocation cases replace navigator.geolocation with a stand-in that
 * answers like the browser would (a PositionError-shaped object), because a real refusal cannot be scripted on
 * every engine.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BERLIN, expectRealApp, pendingDeviceLocation, routeOpenMeteo, searchBerlin, showBerlinWeather, watch } from './support';

const FAVORITES_KEY = 'weather-app.favorites';
const origin = (baseURL: string | undefined): string => new URL(baseURL ?? 'http://localhost').origin;

/**
 * Replaces navigator.geolocation with one that fails with the given PositionError code (1 denied, 2 unavailable,
 * 3 timeout). With `permissionState` the Permissions API answers that state too (a browser where the site is blocked
 * reports "denied" before any call).
 */
async function failingLocation(page: Page, code: 1 | 2 | 3, permissionState?: 'denied' | 'prompt'): Promise<void> {
  await page.addInitScript(
    ([errorCode, state]) => {
      const error = { code: errorCode, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => setTimeout(() => fail(error), 0) },
      });
      if (state !== '') {
        Object.defineProperty(navigator, 'permissions', {
          configurable: true,
          value: { query: () => Promise.resolve({ state, addEventListener: () => undefined, removeEventListener: () => undefined }) },
        });
      }
    },
    [code, permissionState ?? ''] as const,
  );
}

test.describe('geolocation', () => {
  test.describe('permission granted', () => {
    test.use({ geolocation: { latitude: 52.52, longitude: 13.405 }, permissions: ['geolocation'] });

    test('weather shows on open, and Use my location asks again and refreshes the same way', async ({ page, baseURL }) => {
      const w = watch(page, origin(baseURL));
      await routeOpenMeteo(page, origin(baseURL));
      await page.goto('./');
      await expectRealApp(page);
      const current = page.getByRole('region', { name: 'Current weather' });
      await expect(current.getByRole('heading', { name: 'Current location' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
      const before = w.external.length;
      await page.getByRole('button', { name: 'Use my location' }).click();
      await expect.poll(() => w.external.length).toBeGreaterThan(before);
      await expect(current.getByRole('heading', { name: 'Current location' })).toBeVisible();
      for (const raw of w.external) expect(new URL(raw).host, raw).toBe('api.open-meteo.com');
      // The position is sent rounded to 2 decimals and is not kept in the page address or in storage.
      expect(w.external.some((u) => u.includes('latitude=52.52') && u.includes('longitude=13.41'))).toBe(true);
      expect(page.url()).not.toMatch(/52\.5|13\.4/);
      expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/52\.5|13\.4/);
      expect(w.consoleOutput).toEqual([]);
      expect(w.pageErrors).toEqual([]);
    });
  });

  test('refused without a Permissions API answer: the fixed message, no settings hint, search still works', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, origin(baseURL));
    await failingLocation(page, 1);
    await page.goto('./');
    await expectRealApp(page);
    await expect(page.getByText('Location access is turned off for this site. You can search for a city instead.')).toBeVisible();
    await expect(page.getByText('To use your location, allow location access')).toHaveCount(0);
    await showBerlinWeather(page);
  });

  test('refused and the Permissions API says denied: the fixed message and the settings hint, search still works, nothing is stored', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, origin(baseURL));
    await failingLocation(page, 1, 'denied');
    await page.goto('./');
    await expectRealApp(page);
    await expect(page.getByText('Location access is turned off for this site. You can search for a city instead.')).toBeVisible();
    await expect(page.getByText('To use your location, allow location access for this site in your browser settings')).toBeVisible();
    await expect(page.getByLabel('City name')).toBeEnabled();
    await showBerlinWeather(page);
    await expect(page.getByRole('region', { name: 'Current weather' }).getByRole('heading', { name: BERLIN })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  });

  test('position unavailable: its own message, and Use my location can be tried again', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, origin(baseURL));
    await failingLocation(page, 2);
    await page.goto('./');
    await expect(page.getByText('Your location could not be determined. You can search for a city instead.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeEnabled();
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.getByText('Your location could not be determined. You can search for a city instead.')).toBeVisible();
  });

  test('browser without geolocation: the unsupported message and a working search', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, origin(baseURL));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    });
    await page.goto('./');
    await expect(page.getByText('Location detection is not available in this browser. You can search for a city instead.')).toBeVisible();
    await showBerlinWeather(page);
  });

  test('prompt left unanswered: the waiting text stays, no timeout message, and a search still shows weather', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, origin(baseURL));
    await pendingDeviceLocation(page);
    await page.goto('./');
    const status = page.getByRole('region', { name: 'Status' });
    await expect(status.getByText('Detecting your location...')).toBeVisible();
    await expect(page.getByText(/took too long/)).toHaveCount(0);
    await showBerlinWeather(page);
    await expect(page.getByRole('region', { name: 'Current weather' }).getByRole('heading', { name: BERLIN })).toBeVisible();
  });
});

test.describe('localStorage', () => {
  test.beforeEach(async ({ page }) => {
    await failingLocation(page, 1); // the plain search state, whatever the engine does with the permission prompt
  });

  test('a favorite is kept across a reload, and only the favorites record is stored', async ({ page, baseURL }) => {
    await routeOpenMeteo(page, origin(baseURL));
    await page.goto('./');
    await showBerlinWeather(page);
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    const favorites = page.getByRole('region', { name: 'Favorites' });
    await expect(favorites.getByRole('listitem')).toHaveCount(1);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.every((k) => k.startsWith('weather-app.')), keys.join(',')).toBe(true);
    expect(keys).toContain(FAVORITES_KEY);

    await page.reload();
    await expect(favorites.getByRole('listitem')).toHaveCount(1);
    await expect(favorites.getByText(BERLIN).first()).toBeVisible();
    await favorites.getByRole('button', { name: `Show weather for ${BERLIN}` }).click();
    await expect(page.getByRole('region', { name: 'Current weather' }).getByRole('heading', { name: BERLIN })).toBeVisible();
  });

  test.describe('unreadable saved favorites', () => {
    const records = [
      ['not JSON', '{not json'],
      ['a number', '42'],
      ['wrong version', JSON.stringify({ v: 999, items: [] })],
      ['items not a list', JSON.stringify({ v: 1, items: 'x' })],
      ['an item without coordinates', JSON.stringify({ v: 1, items: [{ name: 'X' }] })],
    ] as const;

    for (const [label, record] of records) {
      test(`${label}: the app opens, says the favorites were cleared, starts empty and accepts a new favorite`, async ({ page, baseURL }) => {
        const w = watch(page, origin(baseURL));
        await routeOpenMeteo(page, origin(baseURL));
        await page.goto('./');
        await page.evaluate(([key, value]) => localStorage.setItem(key as string, value as string), [FAVORITES_KEY, record]);
        await page.reload();
        await expectRealApp(page);
        await expect(page.getByText('Your saved favorites could not be read and were cleared.')).toBeVisible();
        const favorites = page.getByRole('region', { name: 'Favorites' });
        await expect(favorites.getByRole('listitem')).toHaveCount(0);
        await showBerlinWeather(page);
        await page.getByRole('button', { name: 'Add to favorites' }).click();
        await expect(favorites.getByRole('listitem')).toHaveCount(1);
        expect(w.pageErrors).toEqual([]);
        expect(w.consoleOutput.filter((m) => !m.includes('Failed to load resource'))).toEqual([]);
      });
    }
  });

  test('localStorage missing (reading it throws): the app opens, weather works, and saving a favorite shows the fixed message', async ({ page, baseURL }) => {
    const w = watch(page, origin(baseURL));
    await routeOpenMeteo(page, origin(baseURL));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    await page.goto('./');
    await expectRealApp(page);
    await showBerlinWeather(page);
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await expect(page.getByText('Favorites cannot be saved on this device. They will be kept only until you close this page.').first()).toBeVisible();
    // The favorite is kept for the session even though it cannot be saved.
    await expect(page.getByRole('region', { name: 'Favorites' }).getByRole('listitem')).toHaveCount(1);
    expect(w.pageErrors).toEqual([]);
  });

  test('writes failing (storage full): the same fixed message, the app keeps working', async ({ page, baseURL }) => {
    const w = watch(page, origin(baseURL));
    await routeOpenMeteo(page, origin(baseURL));
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    await page.goto('./');
    await showBerlinWeather(page);
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await expect(page.getByText('Favorites cannot be saved on this device.').first()).toBeVisible();
    await expect(page.getByLabel('City name')).toBeEnabled();
    await searchBerlin(page);
    expect(w.pageErrors).toEqual([]);
  });
});

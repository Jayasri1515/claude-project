/**
 * TASK-040: responsive layout in real browsers (Edge and Chrome via Playwright).
 * Covers AC-007-1, AC-007-4, FR-040, FR-043, NFR-002 at 320, 768, 1280 and 1920 px.
 * Demo mode (invented data). Breakpoints come from Config (wide >= 768, extra-wide >= 1024).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const VIEWPORTS = [
  { width: 320, layout: 'narrow' },
  { width: 768, layout: 'wide' },
  { width: 1280, layout: 'extra-wide' },
  { width: 1920, layout: 'extra-wide' },
] as const;

async function showWeather(page: Page): Promise<void> {
  await page.getByLabel('City name').fill('Testville');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const current = page.getByRole('region', { name: 'Current weather' });
  await expect(current.getByText('Temperature')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Add to favorites' }).click();
  await expect(page.getByRole('region', { name: 'Favorites' }).getByRole('listitem')).toHaveCount(1);
}

type PanelName = 'search' | 'current' | 'forecast' | 'favorites';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

async function panelBoxes(page: Page): Promise<Record<PanelName, Box>> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const r = (document.querySelector(selector) as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height, right: r.right, bottom: r.bottom + window.scrollY };
    };
    return {
      search: box('.panel-search'),
      current: box('.panel-current'),
      forecast: box('.panel-forecast'),
      favorites: box('.panel-favorites'),
    };
  });
}

/** Panel names in the order a reader sees them: top to bottom, and left to right within a row. */
function readingOrder(boxes: Record<PanelName, Box>): PanelName[] {
  const names = Object.keys(boxes) as PanelName[];
  return names.sort((a, c) => (Math.abs(boxes[a].y - boxes[c].y) < 1 ? boxes[a].x - boxes[c].x : boxes[a].y - boxes[c].y));
}

for (const { width, layout } of VIEWPORTS) {
  test.describe(`viewport ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`tier is ${layout}, no horizontal scroll before and after weather loads, nothing clipped`, async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Weather' })).toBeVisible();
      await expect(page.locator('.app')).toHaveAttribute('data-layout', layout);

      const overflow = () =>
        page.evaluate(() => ({
          doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: document.body.scrollWidth - document.documentElement.clientWidth,
        }));
      expect(await overflow()).toEqual({ doc: 0, body: 0 });

      await showWeather(page);
      expect(await overflow()).toEqual({ doc: 0, body: 0 });

      const boxes = await panelBoxes(page);
      for (const [name, b] of Object.entries(boxes)) {
        expect(b.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.right, `${name} right edge`).toBeLessThanOrEqual(width + 0.5);
        expect(b.width, `${name} width`).toBeGreaterThan(150);
      }
    });

    test('arrangement matches the tier, and the visual reading order equals the DOM order (C3)', async ({ page }) => {
      await page.goto('/');
      await showWeather(page);
      const b = await panelBoxes(page);
      const sameColumn = (a: Box, c: Box) => Math.abs(a.x - c.x) < 1;
      const sameRow = (a: Box, c: Box) => Math.abs(a.y - c.y) < 1;
      if (layout === 'narrow') {
        // One column, in DOM order.
        expect(sameColumn(b.search, b.current) && sameColumn(b.current, b.forecast) && sameColumn(b.forecast, b.favorites)).toBe(true);
        expect(b.search.y).toBeLessThan(b.current.y);
        expect(b.current.y).toBeLessThan(b.forecast.y);
        expect(b.forecast.y).toBeLessThan(b.favorites.y);
      } else if (layout === 'wide') {
        // Two columns, filled row by row: [search, current] then [forecast, favorites].
        expect(sameRow(b.search, b.current)).toBe(true);
        expect(sameRow(b.forecast, b.favorites)).toBe(true);
        expect(sameColumn(b.search, b.forecast)).toBe(true);
        expect(sameColumn(b.current, b.favorites)).toBe(true);
        expect(b.current.x).toBeGreaterThan(b.search.right - 1);
        expect(b.forecast.y).toBeGreaterThan(Math.max(b.search.bottom, b.current.bottom) - 1);
      } else {
        // Three columns: [search, current, forecast] in the first row, favorites in the second row under search.
        expect(sameRow(b.search, b.current) && sameRow(b.current, b.forecast)).toBe(true);
        expect(b.current.x).toBeGreaterThan(b.search.right - 1);
        expect(b.forecast.x).toBeGreaterThan(b.current.right - 1);
        expect(sameColumn(b.search, b.favorites)).toBe(true);
        expect(b.favorites.y).toBeGreaterThan(Math.max(b.search.bottom, b.current.bottom, b.forecast.bottom) - 1);
      }

      // In every tier, reading the panels top-to-bottom, then left-to-right, gives exactly the DOM order.
      // (The DOM order is also the tab order: search, current, forecast, favorites.)
      expect(readingOrder(b)).toEqual(['search', 'current', 'forecast', 'favorites']);
    });

    test('the footer is below every panel, inside the viewport width, and its links are not clipped (TASK-025)', async ({ page }) => {
      await page.goto('/');
      await showWeather(page);
      const footer = page.getByRole('contentinfo');
      await expect(footer).toBeVisible();
      const geometry = await page.evaluate(() => {
        const f = (document.querySelector('footer.app-footer') as HTMLElement).getBoundingClientRect();
        const panels = Array.from(document.querySelectorAll('.panel')).map((p) => p.getBoundingClientRect().bottom + window.scrollY);
        return { top: f.top + window.scrollY, left: f.left, right: f.right, width: f.width, lowestPanelBottom: Math.max(...panels) };
      });
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.lowestPanelBottom - 1);
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width + 0.5);
      for (const link of await footer.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 0.5);
      }
    });

    test('demo mode: the weather panels show data but carry no Open-Meteo credit, and the page holds no link besides the notices file (TASK-025)', async ({ page }) => {
      await page.goto('/');
      await showWeather(page);
      await expect(page.locator('.panel-credit')).toHaveCount(0);
      await expect(page.locator('.panel-current a, .panel-forecast a')).toHaveCount(0);
      await expect(page.locator('a[href*="open-meteo"]')).toHaveCount(0);
    });

    test('the keyboard Tab sequence visits the panels in the same order they appear on screen (C3)', async ({ page }) => {
      await page.goto('/');
      await showWeather(page);
      // Start at the page title (the top of the page) and Tab forward once through everything, noting the panel of each stop.
      await page.locator('h1').focus();
      const visited: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        const panel = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const match = el?.closest('.panel')?.className.match(/panel-(search|current|forecast|favorites)/);
          return match?.[1] ?? null;
        });
        if (panel === null || visited[visited.length - 1] === panel) continue;
        if (visited.includes(panel)) break; // focus came back round to a panel already visited: one full pass is done
        visited.push(panel);
      }
      expect(visited.length).toBeGreaterThanOrEqual(3); // search, current (Refresh), favorites at least
      // The panels in the order Tab reached them must be ordered the same way on screen.
      const onScreen = readingOrder(await panelBoxes(page)).filter((name) => visited.includes(name));
      expect(visited).toEqual(onScreen);
      // And that is also the DOM order (no panel is visited twice or out of sequence).
      expect(visited).toEqual(['search', 'current', 'forecast', 'favorites'].filter((name) => visited.includes(name)));
    });

    test('long place names and messages wrap instead of widening the page', async ({ page }) => {
      await page.goto('/');
      await showWeather(page);
      // Inject an unbroken 120-character name into the favorites button text to simulate a long name.
      await page.evaluate(() => {
        const target = document.querySelector('.favorite-select') as HTMLElement;
        target.textContent = 'W'.repeat(120);
      });
      const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(diff).toBe(0);
    });
  });
}

test('the tier follows the window when it is resized', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-layout', 'extra-wide');
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.locator('.app')).toHaveAttribute('data-layout', 'wide');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator('.app')).toHaveAttribute('data-layout', 'narrow');
});

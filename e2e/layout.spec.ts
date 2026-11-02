/**
 * Responsive layout in real browsers, on the RELEASE build (impl-plan T-63, REQ-WF7-04, REQ-WF7-01).
 * Viewports 320, 767, 768, 1023 and 1024 px (and 1280): no horizontal scroll in the states that carry the most
 * content, one column below 768 px, two columns from 768 px, three from 1024 px (architecture breakpoints
 * wide = 768 and extraWide = 1024, src/core/config.ts), and every control at least 44 by 44 CSS px (height only for
 * links in running text). Open-Meteo is answered from recordings (e2e/support.ts); the device location is refused
 * so every state starts from the plain search state.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { denyDeviceLocation, expectNoHorizontalScroll, expectRealApp, routeOpenMeteo, searchBerlin, showBerlinWeather } from './support';

const WIDTHS = [320, 767, 768, 1023, 1024, 1280] as const;
/** Columns of the page grid per viewport width: 1 below 768, 2 from 768, 3 from 1024. */
const columnsAt = (width: number): number => (width >= 1024 ? 3 : width >= 768 ? 2 : 1);

async function gridColumns(page: Page): Promise<number> {
  return page.evaluate(() => getComputedStyle(document.querySelector('.app-main') as Element).gridTemplateColumns.split(' ').length);
}

/** Visible controls smaller than 44 px (links: height only), as readable descriptions. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const small: string[] = [];
    for (const el of Array.from(document.querySelectorAll('button, a[href], input, select, summary'))) {
      // A radio button or checkbox is operated through its label, which is the touch target.
      const isCheck = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox');
      const box = (isCheck ? el.closest('label') ?? el : el).getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue; // not rendered
      const isLink = el.tagName === 'A';
      if (box.height < 43.5 || (!isLink && box.width < 43.5)) {
        small.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return small;
  });
}

async function setUp(page: Page, baseURL: string | undefined, width: number): Promise<void> {
  await routeOpenMeteo(page, new URL(baseURL ?? 'http://localhost').origin);
  await denyDeviceLocation(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('./');
  await expectRealApp(page);
}

test.describe('release build layout (320, 767, 768, 1023, 1024, 1280 px)', () => {
  for (const width of WIDTHS) {
    test(`${width}px: columns follow the breakpoints; no horizontal scroll in the initial, pick-list, weather and favorites states; targets are 44 px`, async ({ page, baseURL }) => {
      await setUp(page, baseURL, width);
      await expect(page.getByText('Location access is turned off for this site.')).toBeVisible();

      expect(await gridColumns(page), `${width}px grid columns`).toBe(columnsAt(width));
      await expectNoHorizontalScroll(page, `${width}px initial (location refused)`);
      expect(await smallTargets(page), `${width}px initial`).toEqual([]);

      await searchBerlin(page);
      await expect(page.getByRole('group', { name: /Several places match/ }).getByRole('button')).toHaveCount(3);
      await expectNoHorizontalScroll(page, `${width}px pick list`);
      expect(await smallTargets(page), `${width}px pick list`).toEqual([]);

      await page.getByRole('group', { name: /Several places match/ }).getByRole('button', { name: 'Berlin, State of Berlin, Germany' }).click();
      await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3);
      await page.getByRole('button', { name: 'Add to favorites' }).click();
      await expect(page.getByRole('region', { name: 'Favorites' }).getByRole('listitem')).toHaveCount(1);
      await expectNoHorizontalScroll(page, `${width}px weather and favorites`);
      expect(await smallTargets(page), `${width}px weather and favorites`).toEqual([]);

      // Every panel stays inside the viewport and none overlaps another one in the same column.
      const panels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.app-main > section')).map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
      );
      expect(panels).toHaveLength(4);
      for (const p of panels) {
        expect(p.left, `${width}px ${p.name} left edge`).toBeGreaterThanOrEqual(-0.5);
        expect(p.right, `${width}px ${p.name} right edge`).toBeLessThanOrEqual(width + 0.5);
      }
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const a = panels[i];
          const b = panels[j];
          if (a === undefined || b === undefined) continue;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1;
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
          expect(overlapX && overlapY, `${width}px: ${a.name} overlaps ${b.name}`).toBe(false);
        }
      }
      if (columnsAt(width) === 1) {
        // One column: the panels are stacked in reading order with the same left edge.
        for (let i = 1; i < panels.length; i++) {
          expect(panels[i]?.left, `${width}px panel ${i} aligned`).toBeCloseTo(panels[0]?.left ?? 0, 0);
          expect(panels[i]?.top ?? 0, `${width}px panel ${i} below the previous one`).toBeGreaterThanOrEqual((panels[i - 1]?.bottom ?? 0) - 0.5);
        }
      }
    });
  }

  test('the layout switches at the breakpoints when the window is resized (767 -> 768 -> 1024 and back) with the weather kept', async ({ page, baseURL }) => {
    await setUp(page, baseURL, 767);
    await showBerlinWeather(page);
    const seen: Array<[number, number]> = [];
    for (const width of [767, 768, 1023, 1024, 1023, 768, 767, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => gridColumns(page), { message: `columns at ${width}px` }).toBe(columnsAt(width));
      seen.push([width, await gridColumns(page)]);
      await expectNoHorizontalScroll(page, `${width}px after resize`);
      await expect(page.getByRole('region', { name: 'Current weather' }).getByRole('heading', { name: 'Berlin, State of Berlin, Germany' })).toBeVisible();
    }
    expect(seen).toEqual([[767, 1], [768, 2], [1023, 2], [1024, 3], [1023, 2], [768, 2], [767, 1], [320, 1]]);
  });
});

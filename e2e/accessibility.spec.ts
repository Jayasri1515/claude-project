/**
 * TASK-039: accessibility checks in real browsers (Edge and Chrome via Playwright).
 * WCAG 2.1 AA is the plan's default target (ODD-9). What this covers: axe-core WITH colour
 * contrast evaluated, visible focus ring on every tab stop (style + 3:1 contrast), touch
 * target size, and a keyboard-only flow. What it does NOT cover: screen reader output,
 * text spacing/zoom beyond reflow at 320 px, how the icons look to a person (they are the Lucide icons of
 * TASK-035: axe checks them as decorative SVG, and the footer and icons are also checked on the live build in
 * e2e/release.spec.ts), and browsers other than Chromium-based Edge/Chrome.
 */
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const AXE_PATH = fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface AxeNode {
  target: unknown[];
  html: string;
}
interface AxeResults {
  violations: Array<{ id: string; impact?: string; nodes: AxeNode[] }>;
  passes: Array<{ id: string; nodes: AxeNode[] }>;
  incomplete: Array<{ id: string; impact?: string; nodes: AxeNode[] }>;
}

/**
 * axe rules that could not decide ("incomplete": needs a human look) and that a person has reviewed, with the
 * reason. Every incomplete result is recorded as a test annotation (visible in the report) and any rule NOT
 * listed here fails the run, so a new incomplete result cannot go unnoticed.
 */
const REVIEWED_INCOMPLETE: Record<string, string> = {};

async function runAxeRaw(page: Page, disabledRules: string[]): Promise<AxeResults> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(
    async ({ tags, disabled }) => {
      const axe = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<unknown> } }).axe;
      const rules = Object.fromEntries(disabled.map((id) => [id, { enabled: false }]));
      return (await axe.run(document, { runOnly: { type: 'tag', values: tags }, rules })) as never;
    },
    { tags: TAGS, disabled: disabledRules },
  );
}

/** Descriptions of incomplete axe results whose rule id is not in `reviewed`. */
function unreviewedIncomplete(results: AxeResults, reviewed: Record<string, string> = REVIEWED_INCOMPLETE): string[] {
  return results.incomplete
    .filter((item) => !(item.id in reviewed))
    .map((item) => `${item.id}: ${item.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`);
}

/** Runs axe, records every incomplete result as a test annotation, and fails on one that has not been reviewed. */
async function runAxe(page: Page, disabledRules: string[] = []): Promise<AxeResults> {
  const results = await runAxeRaw(page, disabledRules);
  const annotations = test.info().annotations;
  const note = (description: string): void => {
    if (!annotations.some((a) => a.type === 'axe-incomplete' && a.description === description)) annotations.push({ type: 'axe-incomplete', description });
  };
  if (results.incomplete.length === 0) note('none reported by axe');
  for (const item of results.incomplete) {
    note(`${item.id} (${item.nodes.length} node(s)): ${item.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`);
  }
  expect(
    unreviewedIncomplete(results),
    'axe incomplete results that nobody has reviewed (add the rule id and the reason to REVIEWED_INCOMPLETE once checked by hand)',
  ).toEqual([]);
  return results;
}

function summarize(results: AxeResults): string[] {
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`);
}

async function searchTestville(page: Page): Promise<void> {
  await page.getByLabel('City name').fill('Testville');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Forecast' }).getByRole('listitem')).toHaveCount(3, { timeout: 10_000 });
}

for (const width of [320, 1280]) {
  test.describe(`axe at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('no WCAG 2.1 A/AA violations in the initial, loaded, favorite, chooser and error states (colour contrast evaluated)', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      let results = await runAxe(page);
      expect(summarize(results), 'initial').toEqual([]);
      // Prove contrast was actually evaluated (not skipped) on real text.
      const contrast = results.passes.find((p) => p.id === 'color-contrast');
      expect(contrast?.nodes.length ?? 0).toBeGreaterThan(5);

      await searchTestville(page);
      await page.getByRole('button', { name: 'Add to favorites' }).click();
      await expect(page.getByRole('region', { name: 'Favorites' }).getByRole('listitem')).toHaveCount(1);
      results = await runAxe(page);
      expect(summarize(results), 'loaded + favorite').toEqual([]);

      await page.getByLabel('City name').fill('Sampleton');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.getByText('Several places match. Choose one:')).toBeVisible();
      results = await runAxe(page);
      expect(summarize(results), 'chooser').toEqual([]);

      await page.getByLabel('City name').fill('error');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.getByText(/weather service is unavailable/)).toBeVisible();
      results = await runAxe(page);
      expect(summarize(results), 'error state').toEqual([]);
      expect(results.passes.find((p) => p.id === 'color-contrast')?.nodes.length ?? 0).toBeGreaterThan(5);
    });
  });
}

// Regression test for WCAG 2.5.3 (Label in Name, axe rule label-content-name-mismatch): the
// displayed favorite's button shows the visible text "Showing", so its accessible name must
// contain it (it used to have an aria-label that left the marker out).
test('the displayed favorite button name contains its visible text (WCAG 2.5.3)', async ({ page }) => {
  await page.goto('/');
  await searchTestville(page);
  await page.getByRole('button', { name: 'Add to favorites' }).click();
  const shown = page.getByRole('button', { name: /Testville.*Showing/ });
  await expect(shown).toBeVisible();
  await expect(shown).toHaveAttribute('aria-current', 'true');
  const results = await runAxe(page);
  expect(summarize(results)).toEqual([]);
  expect(results.passes.find((p) => p.id === 'label-content-name-mismatch')?.nodes.length ?? 0).toBeGreaterThan(0);
});

// Demo footer (TASK-025): it must not present the invented data as Open-Meteo or GeoNames data.
test('the demo footer says the data is made up, links only the notices file, and has no violations', async ({ page }) => {
  await page.goto('/');
  await searchTestville(page);
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Demo mode: the data shown is made-up sample data.');
  await expect(footer.getByRole('link')).toHaveCount(1);
  await expect(footer.getByRole('link')).toHaveAttribute('href', 'THIRD_PARTY_NOTICES.txt');
  await expect(footer.getByRole('link', { name: /Open-Meteo|GeoNames|CC BY/ })).toHaveCount(0);
  // Weather is displayed (made-up data): the panels must not carry the Open-Meteo credit either.
  await expect(page.getByRole('region', { name: 'Current weather' }).getByText('Temperature')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open-Meteo/ })).toHaveCount(0);
  await expect(page.locator('.panel-credit')).toHaveCount(0);
  // Every weather icon (the Lucide SVGs) is decorative and sits next to its condition text.
  const icons = await page.locator('.condition svg.weather-icon').evaluateAll((svgs) => svgs.map((svg) => svg.getAttribute('aria-hidden')));
  expect(icons.length).toBeGreaterThanOrEqual(4);
  expect(new Set(icons)).toEqual(new Set(['true']));
  const results = await runAxe(page);
  expect(summarize(results)).toEqual([]);
});

test('axe can fail in this setup: a deliberately low-contrast element is reported', async ({ page }) => {
  await page.goto('/');
  // The demo composition is loaded with a dynamic import, so wait until the app has rendered.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'Low contrast sample';
    p.style.cssText = 'color:#cccccc;background:#ffffff';
    document.querySelector('main')?.appendChild(p);
  });
  const results = await runAxe(page);
  expect(results.violations.map((v) => v.id)).toContain('color-contrast');
});

test('every tab stop shows a visible focus ring (outline style, 2px or more, 3:1 against its background)', async ({ page }) => {
  await page.goto('/');
  await searchTestville(page);
  await page.getByRole('button', { name: 'Add to favorites' }).click();

  const seen: Array<{ label: string; style: string; width: number; ratio: number }> = [];
  // Tab through the whole page once. Focus passes through the browser UI (document.body) between
  // the last and first element, so body is skipped; each element is marked when first seen and the
  // loop ends when a marked element is reached again (a full cycle).
  let cycles = 0;
  for (let i = 0; i < 80 && cycles < 1; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return 'skip' as const;
      if (el.dataset.tabSeen === '1') return 'cycle' as const;
      el.dataset.tabSeen = '1';
      const cs = getComputedStyle(el);
      const parse = (c: string): [number, number, number, number] => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        const p = (m?.[1] ?? '0,0,0,0').split(/[ ,/]+/).filter(Boolean).map(Number);
        return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
      };
      let bg: number[] = [255, 255, 255];
      for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c[3] > 0) {
          bg = c;
          break;
        }
      }
      const l1 = lum(parse(cs.outlineColor));
      const l2 = lum(bg);
      return {
        label: `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || el.id).trim().slice(0, 30)}`,
        style: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
        ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
      };
    });
    if (info === 'skip') continue;
    if (info === 'cycle') {
      cycles += 1;
      continue;
    }
    seen.push(info);
  }
  expect(cycles, 'completed one full Tab cycle').toBe(1);
  expect(seen.length).toBeGreaterThan(8); // search, locate, unit radios, nav links, refresh, favorites...
  for (const s of seen) {
    expect(s.style, s.label).not.toBe('none');
    expect(s.width, s.label).toBeGreaterThanOrEqual(2);
    expect(s.ratio, s.label).toBeGreaterThanOrEqual(3);
  }
});

test('programmatic focus targets (headings reached from the nav) show a focus ring too', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Forecast' }).focus();
  await page.keyboard.press('Enter');
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, text: el.textContent, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  });
  expect(info.tag).toBe('H2');
  expect(info.text).toBe('Forecast');
  expect(info.style).not.toBe('none');
  expect(info.width).toBeGreaterThanOrEqual(2);
});

for (const width of [320, 1280]) {
  test(`touch targets are at least 44x44 CSS px at ${width}px (links, buttons, text input, radio labels)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await searchTestville(page);
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    await page.getByLabel('City name').fill('Sampleton');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('Several places match. Choose one:')).toBeVisible();

    const small = await page.evaluate(() => {
      const out: string[] = [];
      const targets = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input[type="text"], input[type="radio"]'));
      for (const el of targets) {
        const box = (el instanceof HTMLInputElement && el.type === 'radio' ? el.closest('label') ?? el : el).getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (box.width < 43.5 || box.height < 43.5) {
          out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
      return { out, count: targets.length };
    });
    expect(small.count).toBeGreaterThan(10);
    expect(small.out).toEqual([]);
  });
}

// ---- Keyboard only (TASK-039) ------------------------------------------------------------------
// These tests run against the browser harness (e2e/harness.html: live mode, demo providers wrapped with
// call counters and a hold/release gate), reach every control with Tab / Shift+Tab and activate it with
// Enter or Space (never .focus() or .click()), and check that each action really reached the data layer.
// One exception, stated: the temperature unit is a native radio group, which is a single tab stop, so the
// other radio is chosen with the arrow key that the platform defines for radio groups.

interface HarnessCalls {
  search: number;
  current: number;
  forecast: number;
}
const harnessCalls = (page: Page): Promise<HarnessCalls> =>
  page.evaluate(() => ({ ...(window as unknown as { __harness: { calls: HarnessCalls } }).__harness.calls }));
const harnessHold = (page: Page): Promise<void> => page.evaluate(() => (window as unknown as { __harness: { hold(): void } }).__harness.hold());
const harnessRelease = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as { __harness: { release(): void } }).__harness.release());

/** What the focused element is called, as a user would hear it. */
async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return '(page)';
    const labelled = (el as HTMLInputElement).labels?.[0]?.textContent;
    return (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
  });
}

/** Presses Tab (or Shift+Tab) until the focused element's name matches; fails if it is not reached. */
async function tabTo(page: Page, name: RegExp, direction: 'forward' | 'back' = 'forward', max = 40): Promise<string> {
  const visited: string[] = [];
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press(direction === 'forward' ? 'Tab' : 'Shift+Tab');
    const current = await focusedName(page);
    visited.push(current);
    if (name.test(current)) return current;
  }
  throw new Error(`Did not reach ${name} with ${direction} Tab within ${max} presses. Visited: ${visited.join(' | ')}`);
}

const HARNESS = '/e2e/harness.html?start=1';

test('keyboard only: search, choose, favorite, change unit and refresh without a mouse (loading and Fahrenheit states included)', async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const status = page.getByRole('region', { name: 'Status' });
  const current = page.getByRole('region', { name: 'Current weather' });
  const forecast = page.getByRole('region', { name: 'Forecast' });
  expect(await focusedName(page)).toBe('(page)'); // nothing is focused to start with

  // Search: Tab to the field, type, Enter. The provider is held so the "Searching..." state can be seen.
  expect(await tabTo(page, /^City name$/)).toBe('City name');
  await page.keyboard.type('Sampleton');
  await harnessHold(page);
  await page.keyboard.press('Enter');
  await expect(status.getByText('Searching...')).toBeVisible();
  await expect.poll(async () => (await harnessCalls(page)).search).toBe(1);
  await harnessRelease(page);
  await expect(status.getByText('Searching...')).toHaveCount(0);

  // Two matches: focus moves to the chooser heading; Tab to the first candidate; Enter. Weather is held so
  // the "Loading weather..." state can be seen, then released.
  await expect(page.getByText('Several places match. Choose one:')).toBeVisible();
  expect(await focusedName(page)).toBe('Several places match. Choose one:');
  const candidate = await tabTo(page, /Sampleton/, 'forward', 3);
  expect(candidate).toMatch(/Sampleton/);
  await harnessHold(page);
  await page.keyboard.press('Enter');
  await expect(status.getByText('Loading weather...')).toBeVisible();
  await expect(current.getByText('Loading...')).toBeVisible();
  await expect.poll(async () => (await harnessCalls(page)).current).toBe(1);
  await harnessRelease(page);
  await expect(current.getByText('Temperature')).toBeVisible({ timeout: 10_000 });
  await expect(status.getByText('Loading weather...')).toHaveCount(0);
  await expect(forecast.getByRole('listitem')).toHaveCount(3);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe(
    await page.getByRole('heading', { level: 2, name: 'Current weather' }).getAttribute('id'),
  );
  const celsius = (await current.locator('dd').first().textContent()) ?? '';
  expect(celsius).toMatch(/^-?\d+°C$/);

  // Favorite it: Tab to "Add to favorites", Space.
  await tabTo(page, /^Add to favorites$/, 'forward', 15);
  await page.keyboard.press('Space');
  await expect(page.getByRole('region', { name: 'Favorites' }).getByRole('listitem')).toHaveCount(1);
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true); // focus was not lost

  // Fahrenheit: Shift+Tab back to the unit radios (one tab stop, on the checked radio), then the arrow key.
  expect(await tabTo(page, /^°C$/, 'back', 40)).toBe('°C');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '°F' })).toBeChecked();
  const celsiusValue = Number(celsius.replace('°C', ''));
  await expect(current.locator('dd').first()).toHaveText(`${Math.round((celsiusValue * 9) / 5 + 32)}°F`);
  await expect(forecast.getByText(/°F/).first()).toBeVisible();
  await expect(forecast.getByText(/°C/)).toHaveCount(0);
  await expect(current.getByText(/°C/)).toHaveCount(0);

  // Refresh: Tab to the button, hold the providers, Enter. The data layer is called once more (current and
  // forecast), the busy state shows and blocks a second Enter, then it clears when the providers answer.
  await tabTo(page, /^Refresh$/, 'forward', 40);
  const refresh = page.getByRole('button', { name: 'Refresh' });
  const before = await harnessCalls(page);
  await harnessHold(page);
  await page.keyboard.press('Enter');
  await expect(status.getByText('Refreshing weather...')).toBeVisible();
  await expect(refresh).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(async () => (await harnessCalls(page)).current).toBe(before.current + 1);
  await expect.poll(async () => (await harnessCalls(page)).forecast).toBe(before.forecast + 1);
  expect(await focusedName(page)).toBe('Refresh'); // focus stays on the busy button
  await page.keyboard.press('Enter'); // a second activation while busy is ignored
  await page.keyboard.press('Space');
  expect((await harnessCalls(page)).current).toBe(before.current + 1);
  await harnessRelease(page);
  await expect(status.getByText('Refreshing weather...')).toHaveCount(0);
  await expect(refresh).not.toHaveAttribute('aria-disabled', 'true');
  await expect(current.locator('dd').first()).toHaveText(/°F$/); // still Fahrenheit after the refresh
  expect(await focusedName(page)).toBe('Refresh');
  expect((await harnessCalls(page)).current).toBe(before.current + 1);
});

test('keyboard only: "Use my location" when the browser refuses shows the message, keeps focus, and city search still works', async ({ page }) => {
  await page.goto(HARNESS); // no geolocation permission is granted in this context
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await tabTo(page, /^Use my location$/, 'forward', 15);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Location access was denied/)).toBeVisible();
  expect(await focusedName(page)).toBe('Use my location'); // focus was not dropped
  await expect(page.getByRole('button', { name: 'Use my location' })).not.toHaveAttribute('aria-disabled', 'true');
  // Back to the search field with Shift+Tab, then search by keyboard.
  await tabTo(page, /^City name$/, 'back', 15);
  await page.keyboard.type('Testville');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 3, name: 'Testville, Testshire, Testland' })).toBeVisible({ timeout: 10_000 });
});

test('information is never carried by colour alone: the displayed favorite has a text marker and aria-current', async ({ page }) => {
  await page.goto('/');
  await searchTestville(page);
  await page.getByRole('button', { name: 'Add to favorites' }).click();
  const fav = page.getByRole('button', { name: /Testville.*Showing/ });
  await expect(fav).toHaveAttribute('aria-current', 'true');
  await expect(fav).toContainText('Showing');
});

// ---- axe "incomplete" results are never ignored ----------------------------------------------------
test('an unreviewed axe "incomplete" result is detected and fails the run (the review list is not a rubber stamp)', async ({ page }) => {
  // Synthetic result: unknown rule id is reported, a listed one is not.
  const fake: AxeResults = {
    violations: [],
    passes: [],
    incomplete: [{ id: 'some-rule', nodes: [{ target: ['p'], html: '<p>x</p>' }] }],
  };
  expect(unreviewedIncomplete(fake, {})).toEqual(['some-rule: <p>x</p>']);
  expect(unreviewedIncomplete(fake, { 'some-rule': 'checked by hand' })).toEqual([]);

  // Real axe: text over a background image cannot be evaluated automatically, so axe reports color-contrast as incomplete.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'Text over an image';
    p.style.cssText = 'color:#444444;background-image:linear-gradient(90deg,#ffffff,#000000);padding:8px';
    document.querySelector('main')?.appendChild(p);
  });
  const results = await runAxeRaw(page, []);
  const found = results.incomplete.map((i) => i.id);
  expect(found, 'axe reports an incomplete result for text over a gradient').toContain('color-contrast');
  expect(unreviewedIncomplete(results).join('\n')).toContain('color-contrast');
});

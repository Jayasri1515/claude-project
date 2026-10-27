import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The stylesheet cannot be laid out here (no browser), so these tests read the
 * rules as text. They pin that the wide tiers do not reorder panels (C3), long-string
 * wrapping and the non-colour cue for the shown favorite (L3). Real layout is
 * checked in a browser under TASK-040.
 */
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(): Array<{ selectors: string[]; body: Record<string, string> }> {
  const out: Array<{ selectors: string[]; body: Record<string, string> }> = [];
  for (const chunk of css.split('}')) {
    const [head, rest] = chunk.split('{');
    if (head === undefined || rest === undefined) continue;
    const body: Record<string, string> = {};
    for (const decl of rest.split(';')) {
      const [name, ...value] = decl.split(':');
      if (name !== undefined && value.length > 0) body[name.trim()] = value.join(':').trim();
    }
    out.push({ selectors: head.split(',').map((s) => s.trim()), body });
  }
  return out;
}

function declared(selector: string, property: string): string | undefined {
  return rules()
    .filter((r) => r.selectors.includes(selector))
    .map((r) => r.body[property])
    .filter((v): v is string => v !== undefined)
    .pop();
}

/*
 * C3 (user-approved 2026-10-27): in the wide tiers the visual order must equal the keyboard (tab) order, which is
 * the DOM order. The stylesheet therefore may not reposition panels at all: the grid sets only the column count
 * and the browser's normal row-by-row flow places the panels. The real arrangement and the real Tab sequence are
 * checked in Edge and Chrome by e2e/layout.spec.ts.
 */
describe('wide tiers keep visual order equal to DOM and tab order (C3)', () => {
  const REORDERING = [
    ['grid-column', /(^|[;{\s])grid-column\s*:/],
    ['grid-row', /(^|[;{\s])grid-row\s*:/],
    ['grid-area', /(^|[;{\s])grid-area\s*:/],
    ['grid-column-start/end', /(^|[;{\s])grid-column-(start|end)\s*:/],
    ['grid-row-start/end', /(^|[;{\s])grid-row-(start|end)\s*:/],
    ['grid-template-areas', /(^|[;{\s])grid-template-areas\s*:/],
    ['order', /(^|[;{\s])order\s*:/],
    ['dense auto-flow', /grid-auto-flow\s*:[^;}]*dense/],
    ['reverse direction', /(row|column)-reverse/],
  ] as const;

  it.each(REORDERING)('the stylesheet uses no %s (nothing may move a panel away from its DOM position)', (_name, pattern) => {
    expect(css).not.toMatch(pattern);
  });

  it('the detector rules can fire (self-test)', () => {
    const samples = [
      '.a { grid-column: 2; }',
      '.a{grid-row:1 / span 2}',
      '.a { grid-area: x }',
      '.a { order: -1; }',
      '.a { grid-auto-flow: row dense; }',
      '.a { flex-direction: row-reverse; }',
    ];
    for (const sample of samples) expect(REORDERING.some(([, pattern]) => pattern.test(sample)), sample).toBe(true);
    // 'border' and 'border-radius' must not trip the 'order' rule.
    expect(REORDERING.some(([, pattern]) => pattern.test('.a { border: 1px solid; border-radius: 6px; }'))).toBe(false);
  });

  it.each([
    ['wide', 2],
    ['extra-wide', 3],
  ])('%s sets only the column count: %i equal columns', (tier, columns) => {
    const value = declared(`[data-layout='${tier}'] .app-main`, 'grid-template-columns');
    expect(value?.split('minmax(0, 1fr)').length).toBe(columns + 1);
  });

  it('no panel rule is scoped to a layout tier', () => {
    for (const r of rules()) {
      for (const selector of r.selectors) {
        if (selector.includes('data-layout') && selector.includes('.panel')) throw new Error(`tier-specific panel rule: ${selector}`);
      }
    }
  });
});

describe('long strings and the shown favorite (L3)', () => {
  it('the app wraps long unbroken strings', () => {
    expect(declared('.app', 'overflow-wrap')).toBe('anywhere');
  });

  it('buttons may wrap their text and shrink inside their container', () => {
    expect(declared('button', 'white-space')).toBe('normal');
    expect(declared('button', 'max-width')).toBe('100%');
    expect(declared('.favorite-select', 'min-width')).toBe('0');
  });

  it('the shown favorite differs by more than colour (weight and edge)', () => {
    const selector = ".favorite-select[aria-current='true']";
    expect(declared(selector, 'font-weight')).toBe('700');
    expect(declared(selector, 'border-left-width')).toBeDefined();
  });

  it('busy buttons are styled as unavailable', () => {
    expect(declared("button[aria-disabled='true']", 'cursor')).toBe('not-allowed');
  });
});

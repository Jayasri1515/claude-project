// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, CircleQuestionMark, Sun } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EXPECTED_ICONS } from '../../scripts/scanDistLib.mjs';
import { CONDITION_PRESENTATION, describeCondition } from '../../src/core/conditions';
import { CONDITION_CODES } from '../../src/core/domain';
import type { ConditionCode } from '../../src/core/domain';
import { ConditionView } from '../../src/ui/ConditionView';
import { WeatherIcon } from '../../src/ui/WeatherIcon';
import { CONDITION_ICONS } from '../../src/ui/weatherIcons';

/** TASK-035: Lucide icons for every ConditionCode, decorative next to the text, labelled when they stand alone. */
const svgOf = (container: HTMLElement): SVGElement => {
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('no svg rendered');
  return svg;
};

describe('icon table completeness', () => {
  it('maps every ConditionCode, UNKNOWN included, to an icon, with no extra entries', () => {
    expect(Object.keys(CONDITION_ICONS).sort()).toEqual([...CONDITION_CODES].sort());
    for (const code of CONDITION_CODES) expect(CONDITION_ICONS[code], code).toBeDefined();
  });

  it('gives each condition its own icon (no two conditions look alike)', () => {
    const icons = CONDITION_CODES.map((code) => CONDITION_ICONS[code]);
    expect(new Set(icons).size).toBe(CONDITION_CODES.length);
  });

  // Pinned mapping: every ConditionCode -> its specific Lucide icon (component identity and rendered class name).
  // Swapping two icons in src/ui/weatherIcons.ts must fail here. The names must also equal the 8-icon bundle pin.
  const PINNED_ICONS = {
    CLEAR: { component: Sun, name: 'sun' },
    PARTLY_CLOUDY: { component: CloudSun, name: 'cloud-sun' },
    CLOUDY: { component: Cloud, name: 'cloud' },
    RAIN: { component: CloudRain, name: 'cloud-rain' },
    SNOW: { component: CloudSnow, name: 'cloud-snow' },
    THUNDERSTORM: { component: CloudLightning, name: 'cloud-lightning' },
    FOG: { component: CloudFog, name: 'cloud-fog' },
    UNKNOWN: { component: CircleQuestionMark, name: 'circle-question-mark' },
  } as const satisfies Record<ConditionCode, { component: unknown; name: string }>;

  it('pins the pinned table to every ConditionCode, with no extra entries', () => {
    expect(Object.keys(PINNED_ICONS).sort()).toEqual([...CONDITION_CODES].sort());
  });

  it.each(CONDITION_CODES.map((code) => [code] as const))('%s is pinned to its specific Lucide icon', (code) => {
    const { component, name } = PINNED_ICONS[code];
    expect(CONDITION_ICONS[code]).toBe(component);
    const svg = svgOf(render(<WeatherIcon condition={code} />).container);
    expect(svg.classList.contains(`lucide-${name}`), `${code} should render lucide-${name}`).toBe(true);
  });

  it('the pinned icon names are exactly the 8-icon bundle pin in scripts/scanDistLib.mjs', () => {
    const names = Object.values(PINNED_ICONS).map((p) => p.name).sort();
    expect(names).toEqual([...EXPECTED_ICONS].sort());
  });

  it.each(CONDITION_CODES.map((code) => [code] as const))('%s renders an SVG that is decorative by default', (code) => {
    const { container } = render(<WeatherIcon condition={code} />);
    const svg = svgOf(container);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBeNull();
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('data-icon-key')).toBe(CONDITION_PRESENTATION[code].iconKey);
    expect(svg.querySelectorAll('path, circle, line, rect, polyline').length).toBeGreaterThan(0); // it has a drawing
  });

  it('UNKNOWN uses the neutral question-mark icon', () => {
    const { container } = render(<WeatherIcon condition="UNKNOWN" />);
    expect(svgOf(container).classList.contains('lucide-circle-question-mark')).toBe(true);
  });

  it('a missing or unrecognized code falls back to the UNKNOWN icon and never throws', () => {
    const unknown = svgOf(render(<WeatherIcon condition="UNKNOWN" />).container).outerHTML;
    expect(svgOf(render(<WeatherIcon condition={undefined} />).container).outerHTML).toBe(unknown);
    expect(svgOf(render(<WeatherIcon condition={'HAIL' as ConditionCode} />).container).outerHTML).toBe(unknown);
    expect(svgOf(render(<WeatherIcon condition={'toString' as ConditionCode} />).container).outerHTML).toBe(unknown);
  });

  it('uses currentColor, so the icon follows the text colour and forced-colours mode', () => {
    const { container } = render(<WeatherIcon condition="RAIN" />);
    expect(svgOf(container).getAttribute('stroke')).toBe('currentColor');
  });
});

describe('accessible names', () => {
  it('an icon that stands alone with a label is exposed as an image with that name', () => {
    const { container } = render(<WeatherIcon condition="RAIN" label={describeCondition('RAIN').label} />);
    const svg = svgOf(container);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Rain');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('a blank label is treated as no label: the icon stays decorative, not an unnamed image', () => {
    const { container } = render(<WeatherIcon condition="RAIN" label="   " />);
    expect(svgOf(container).getAttribute('aria-hidden')).toBe('true');
    expect(svgOf(container).getAttribute('role')).toBeNull();
  });

  it.each(CONDITION_CODES.map((code) => [code] as const))('%s: the condition text is shown next to a decorative icon (never icon-only)', (code) => {
    const { container } = render(<ConditionView condition={code} text={undefined} />);
    const label = describeCondition(code).label;
    expect(container.textContent).toBe(label);
    expect(label.trim().length).toBeGreaterThan(0);
    expect(svgOf(container).getAttribute('aria-hidden')).toBe('true');
  });

  it('an unknown condition with provider text shows that text with the neutral icon', () => {
    const { container } = render(<ConditionView condition="UNKNOWN" text="Dust devils" />);
    expect(container.textContent).toBe('Dust devils');
    expect(svgOf(container).getAttribute('data-icon-key')).toBe('unknown');
  });

  it('a missing condition reads Unavailable beside the neutral icon', () => {
    const { container } = render(<ConditionView condition={undefined} text={undefined} />);
    expect(container.textContent).toBe('Unavailable');
    expect(svgOf(container).getAttribute('data-icon-key')).toBe('unknown');
  });
});

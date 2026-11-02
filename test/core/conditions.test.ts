import { describe, expect, it } from 'vitest';
import { CONDITION_PRESENTATION, describeCondition, NIGHT_ICON_KEYS } from '../../src/core/conditions';
import { CONDITION_CODES } from '../../src/core/domain';
import type { ConditionCode } from '../../src/core/domain';

describe('condition table', () => {
  it('is exhaustive: every ConditionCode has an icon key and a non-empty label', () => {
    expect(Object.keys(CONDITION_PRESENTATION).sort()).toEqual([...CONDITION_CODES].sort());
    for (const code of CONDITION_CODES) {
      const d = describeCondition(code);
      expect(d.condition).toBe(code);
      expect(d.iconKey.length).toBeGreaterThan(0);
      expect(d.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('icon keys are unique per condition', () => {
    const keys = CONDITION_CODES.map((c) => describeCondition(c).iconKey);
    expect(new Set(keys).size).toBe(CONDITION_CODES.length);
  });

  it('known conditions ignore provider text', () => {
    expect(describeCondition('RAIN', 'Drizzly').label).toBe('Rain');
  });
});

describe('drizzle category', () => {
  it('has its own icon key and the text "Drizzle" (M-44)', () => {
    const d = describeCondition('DRIZZLE');
    expect(d.iconKey).toBe('drizzle');
    expect(d.label).toBe('Drizzle');
  });
});

describe('day and night (architecture Section 7 item 8, M-44)', () => {
  it('clear by day reads Sunny with the day icon', () => {
    expect(describeCondition('CLEAR', undefined, { isDay: true })).toMatchObject({ label: 'Sunny', iconKey: 'clear', night: false });
  });

  it('clear at night reads Clear with the night icon', () => {
    expect(describeCondition('CLEAR', undefined, { isDay: false })).toMatchObject({ label: 'Clear', iconKey: 'clear-night', night: true });
  });

  it('clear with no day/night flag reads the neutral "Clear" (never Sunny) with the day icon', () => {
    expect(describeCondition('CLEAR')).toMatchObject({ label: 'Clear', iconKey: 'clear', night: false });
    expect(describeCondition('CLEAR', undefined, { surface: 'current' })).toMatchObject({ label: 'Clear', iconKey: 'clear' });
  });

  it('forecast days always use the day variant and Sunny, even when isDay is false', () => {
    expect(describeCondition('CLEAR', undefined, { surface: 'forecast' })).toMatchObject({ label: 'Sunny', iconKey: 'clear' });
    expect(describeCondition('CLEAR', undefined, { surface: 'forecast', isDay: false })).toMatchObject({ label: 'Sunny', iconKey: 'clear', night: false });
    expect(describeCondition('PARTLY_CLOUDY', undefined, { surface: 'forecast', isDay: false })).toMatchObject({ iconKey: 'partly-cloudy', night: false });
  });

  it('partly cloudy keeps its text by night and gets the night icon', () => {
    expect(describeCondition('PARTLY_CLOUDY', undefined, { isDay: false })).toMatchObject({ label: 'Partly cloudy', iconKey: 'partly-cloudy-night', night: true });
    expect(describeCondition('PARTLY_CLOUDY', undefined, { isDay: true })).toMatchObject({ label: 'Partly cloudy', iconKey: 'partly-cloudy', night: false });
  });

  it.each(CONDITION_CODES.filter((c) => c !== 'CLEAR' && c !== 'PARTLY_CLOUDY').map((c) => [c] as const))(
    '%s has no night variant: same icon and text day or night',
    (code) => {
      const day = describeCondition(code, undefined, { isDay: true });
      const night = describeCondition(code, undefined, { isDay: false });
      expect(night).toEqual(day);
      expect(night.night).toBe(false);
    },
  );

  it('night icon keys do not collide with the day keys', () => {
    const keys = [...CONDITION_CODES.map((c) => CONDITION_PRESENTATION[c].iconKey), ...Object.values(NIGHT_ICON_KEYS)];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('unknown conditions', () => {
  it('missing code maps to UNKNOWN with the neutral icon', () => {
    const d = describeCondition(undefined);
    expect(d.condition).toBe('UNKNOWN');
    expect(d.iconKey).toBe('unknown');
    expect(d.label.length).toBeGreaterThan(0);
  });

  it('unrecognized runtime code maps to UNKNOWN', () => {
    expect(describeCondition('HAIL' as ConditionCode).condition).toBe('UNKNOWN');
  });

  it('UNKNOWN uses provider text when present, trimmed', () => {
    expect(describeCondition('UNKNOWN', '  Dust devils ').label).toBe('Dust devils');
    expect(describeCondition(undefined, 'Haze').label).toBe('Haze');
  });

  it('blank provider text falls back to the table label', () => {
    expect(describeCondition('UNKNOWN', '   ').label).toBe('Unknown conditions');
  });
});

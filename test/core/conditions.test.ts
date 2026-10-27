import { describe, expect, it } from 'vitest';
import { CONDITION_PRESENTATION, describeCondition } from '../../src/core/conditions';
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

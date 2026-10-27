import { describe, expect, it } from 'vitest';
import { deriveLastUpdated, padForecast, truncateForecast } from '../../src/core/forecast';
import type { ForecastDay } from '../../src/core/domain';
import { sampleForecast } from '../fixtures/domain';

const days = (n: number): ForecastDay[] =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-01-0${i + 1}`, tempMaxC: i }));

describe('padForecast', () => {
  it.each([0, 1, 2, 3])('pads %i supplied days to 3 slots', (n) => {
    const slots = padForecast(days(n), 3);
    expect(slots).toHaveLength(3);
    expect(slots.filter((s) => s.kind === 'day')).toHaveLength(n);
    expect(slots.filter((s) => s.kind === 'unavailable')).toHaveLength(3 - n);
    // Real days come first, in order, then placeholders.
    slots.forEach((s, i) => expect(s.kind).toBe(i < n ? 'day' : 'unavailable'));
  });

  it('truncates more than the configured count', () => {
    const slots = padForecast(days(5), 3);
    expect(slots).toHaveLength(3);
    expect(slots[2]).toEqual({ kind: 'day', day: days(5)[2] });
  });

  it('honors a different configured count', () => {
    expect(padForecast(sampleForecast, 2)).toHaveLength(2);
    expect(padForecast([], 5)).toHaveLength(5);
  });

  it('invalid counts give no slots and do not mutate the input', () => {
    const input = days(2);
    expect(padForecast(input, 0)).toEqual([]);
    expect(padForecast(input, -1)).toEqual([]);
    expect(padForecast(input, Number.NaN)).toEqual([]);
    expect(input).toHaveLength(2);
  });
});

describe('truncateForecast', () => {
  it('keeps at most count days without padding', () => {
    expect(truncateForecast(days(5), 3)).toHaveLength(3);
    expect(truncateForecast(days(1), 3)).toHaveLength(1);
  });
});

describe('deriveLastUpdated', () => {
  const t1 = new Date('2026-01-01T10:00:00Z');
  const t2 = new Date('2026-01-01T10:05:00Z');

  it('is undefined if either section never succeeded', () => {
    expect(deriveLastUpdated({}, {})).toBeUndefined();
    expect(deriveLastUpdated({ updatedAt: t1 }, {})).toBeUndefined();
    expect(deriveLastUpdated({}, { updatedAt: t1 })).toBeUndefined();
  });

  it('returns the shared time when equal', () => {
    expect(deriveLastUpdated({ updatedAt: t1 }, { updatedAt: new Date(t1) })?.getTime()).toBe(t1.getTime());
  });

  it('returns the older time when they differ, whichever section is older', () => {
    expect(deriveLastUpdated({ updatedAt: t1 }, { updatedAt: t2 })).toBe(t1);
    expect(deriveLastUpdated({ updatedAt: t2 }, { updatedAt: t1 })).toBe(t1);
  });

  it('ignores invalid dates', () => {
    expect(deriveLastUpdated({ updatedAt: new Date(Number.NaN) }, { updatedAt: t1 })).toBeUndefined();
  });
});

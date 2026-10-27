import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, createConfig } from '../../src/core/config';

describe('Config defaults', () => {
  it('matches the architecture 4.12 recommended defaults', () => {
    expect(DEFAULT_CONFIG.weatherTimeoutMs).toBe(10000);
    expect(DEFAULT_CONFIG.locationTimeoutMs).toBe(10000);
    expect(DEFAULT_CONFIG.forecastDays).toBe(3);
    expect(DEFAULT_CONFIG.forecastIncludesToday).toBe(false);
    expect(DEFAULT_CONFIG.maxFavorites).toBeUndefined();
    expect(DEFAULT_CONFIG.defaultTemperatureUnit).toBe('C');
    expect(DEFAULT_CONFIG.staleAfterMs).toBeUndefined();
    expect(DEFAULT_CONFIG.searchResultLimit).toBe(5);
    expect(DEFAULT_CONFIG.loadingIndicatorMaxDelayMs).toBe(200);
    expect(DEFAULT_CONFIG.attributionText).toBe('');
  });

  it('carries the proposed breakpoints and maxInputLength', () => {
    expect(DEFAULT_CONFIG.breakpoints).toEqual({ wide: 768, extraWide: 1024 });
    expect(DEFAULT_CONFIG.maxInputLength).toBe(100);
  });

  it('has every architecture key', () => {
    expect(Object.keys(DEFAULT_CONFIG).sort()).toEqual(
      [
        'attributionText',
        'breakpoints',
        'defaultTemperatureUnit',
        'forecastDays',
        'forecastIncludesToday',
        'loadingIndicatorMaxDelayMs',
        'maxFavorites',
        'maxInputLength',
        'searchResultLimit',
        'staleAfterMs',
        'weatherTimeoutMs',
        'locationTimeoutMs',
      ].sort(),
    );
  });

  it('createConfig() with no overrides equals the defaults', () => {
    expect(createConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe('Config validation', () => {
  const positiveKeys = ['weatherTimeoutMs', 'locationTimeoutMs', 'forecastDays', 'searchResultLimit'] as const;
  const badValues = [Number.NaN, -1, 0, 1.5, Number.POSITIVE_INFINITY];

  for (const key of positiveKeys) {
    for (const bad of badValues) {
      it(`rejects ${key} = ${String(bad)}`, () => {
        expect(() => createConfig({ [key]: bad })).toThrow(new RegExp(`${key} must be a positive integer`));
      });
    }
    it(`accepts a valid ${key}`, () => {
      expect(createConfig({ [key]: 7 })[key]).toBe(7);
    });
  }

  it('loadingIndicatorMaxDelayMs allows 0 but rejects NaN, negative and fractional', () => {
    expect(createConfig({ loadingIndicatorMaxDelayMs: 0 }).loadingIndicatorMaxDelayMs).toBe(0);
    for (const bad of [Number.NaN, -1, 0.5]) {
      expect(() => createConfig({ loadingIndicatorMaxDelayMs: bad })).toThrow(
        /loadingIndicatorMaxDelayMs must be a non-negative integer/,
      );
    }
  });

  it('maxInputLength, maxFavorites and staleAfterMs reject bad values (L4)', () => {
    for (const bad of [Number.NaN, 0, -1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => createConfig({ maxInputLength: bad })).toThrow(/maxInputLength must be a positive integer/);
      expect(() => createConfig({ maxFavorites: bad })).toThrow(/maxFavorites must be a positive integer/);
      expect(() => createConfig({ staleAfterMs: bad })).toThrow(/staleAfterMs must be a positive integer/);
    }
    const valid = createConfig({ maxInputLength: 5, maxFavorites: 3, staleAfterMs: 60_000 });
    expect([valid.maxInputLength, valid.maxFavorites, valid.staleAfterMs]).toEqual([5, 3, 60_000]);
    expect(createConfig({ maxFavorites: undefined }).maxFavorites).toBeUndefined();
  });

  it('the shipped defaults pass validation', () => {
    expect(() => createConfig()).not.toThrow();
  });
});

describe('Config overrides', () => {
  it('overrides selected keys and keeps the rest', () => {
    const c = createConfig({ weatherTimeoutMs: 5000, maxFavorites: 20, defaultTemperatureUnit: 'F' });
    expect(c.weatherTimeoutMs).toBe(5000);
    expect(c.maxFavorites).toBe(20);
    expect(c.defaultTemperatureUnit).toBe('F');
    expect(c.locationTimeoutMs).toBe(10000);
    expect(c.forecastDays).toBe(3);
  });

  it('merges partial breakpoints', () => {
    const c = createConfig({ breakpoints: { wide: 800 } });
    expect(c.breakpoints).toEqual({ wide: 800, extraWide: 1024 });
  });

  it('ignores undefined overrides and does not mutate the defaults', () => {
    const c = createConfig({ weatherTimeoutMs: undefined, searchResultLimit: 3 });
    expect(c.weatherTimeoutMs).toBe(10000);
    expect(c.searchResultLimit).toBe(3);
    expect(DEFAULT_CONFIG.searchResultLimit).toBe(5);
  });

  it('ignores undefined breakpoint entries so they do not clobber defaults', () => {
    const c = createConfig({ breakpoints: { wide: undefined } });
    expect(c.breakpoints).toEqual({ wide: 768, extraWide: 1024 });
    const d = createConfig({ breakpoints: { wide: undefined, extraWide: 1280 } });
    expect(d.breakpoints).toEqual({ wide: 768, extraWide: 1280 });
    expect(createConfig({ breakpoints: undefined }).breakpoints).toEqual({ wide: 768, extraWide: 1024 });
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(createConfig())).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.breakpoints)).toBe(true);
  });
});

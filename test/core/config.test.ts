import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  MAX_PROVIDER_FORECAST_DAYS,
  MAX_SEARCH_RESULT_LIMIT,
  createConfig,
} from '../../src/core/config';

describe('Config defaults', () => {
  it('matches the approved baseline (architecture Section 7, impl-plan T-11)', () => {
    expect(DEFAULT_CONFIG.weatherTimeoutMs).toBe(10000);
    expect(DEFAULT_CONFIG.locationTimeoutMs).toBe(10000);
    expect(DEFAULT_CONFIG.forecastDays).toBe(3);
    expect(DEFAULT_CONFIG.forecastIncludesToday).toBe(true);
    expect(DEFAULT_CONFIG.maxFavorites).toBeUndefined();
    expect(DEFAULT_CONFIG.defaultTemperatureUnit).toBe('C');
    expect(DEFAULT_CONFIG.staleAfterMs).toBeUndefined();
    expect(DEFAULT_CONFIG.searchResultLimit).toBe(5);
    expect(DEFAULT_CONFIG.qualifiedSearchFetchLimit).toBe(20);
    expect(DEFAULT_CONFIG.attributionText).toBe('');
  });

  it('carries the breakpoints, minimum width, input cap, rounding precision and bundle budget', () => {
    expect(DEFAULT_CONFIG.breakpoints).toEqual({ wide: 768, extraWide: 1024 });
    expect(DEFAULT_CONFIG.minViewportWidthPx).toBe(320);
    expect(DEFAULT_CONFIG.maxInputLength).toBe(100);
    expect(DEFAULT_CONFIG.coordinateDecimals).toBe(2);
    expect(DEFAULT_CONFIG.bundleBudgetGzipBytes).toBe(200_000);
  });

  it('has no loading-indicator delay: the indicator is rendered immediately', () => {
    expect(Object.keys(DEFAULT_CONFIG)).not.toContain('loadingIndicatorMaxDelayMs');
  });

  it('the provider-derived values follow provider-verification.md (3 days with today first; at most 100 results)', () => {
    expect(DEFAULT_CONFIG.forecastDays).toBe(3);
    expect(DEFAULT_CONFIG.forecastIncludesToday).toBe(true);
    expect(DEFAULT_CONFIG.searchResultLimit).toBeLessThanOrEqual(MAX_SEARCH_RESULT_LIMIT);
    expect(MAX_SEARCH_RESULT_LIMIT).toBe(100);
  });

  it('has every architecture key', () => {
    expect(Object.keys(DEFAULT_CONFIG).sort()).toEqual(
      [
        'attributionText',
        'breakpoints',
        'defaultTemperatureUnit',
        'forecastDays',
        'forecastIncludesToday',
        'maxFavorites',
        'maxInputLength',
        'minViewportWidthPx',
        'coordinateDecimals',
        'bundleBudgetGzipBytes',
        'searchResultLimit',
        'qualifiedSearchFetchLimit',
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

  it('minViewportWidthPx and bundleBudgetGzipBytes reject bad values', () => {
    for (const bad of [Number.NaN, 0, -1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => createConfig({ minViewportWidthPx: bad })).toThrow(/minViewportWidthPx must be a positive integer/);
      expect(() => createConfig({ bundleBudgetGzipBytes: bad })).toThrow(/bundleBudgetGzipBytes must be a positive integer/);
    }
    expect(createConfig({ minViewportWidthPx: 360 }).minViewportWidthPx).toBe(360);
    expect(createConfig({ bundleBudgetGzipBytes: 150_000 }).bundleBudgetGzipBytes).toBe(150_000);
  });

  it('coordinateDecimals allows 0 to 6 and rejects NaN, negative, fractional and too many', () => {
    expect(createConfig({ coordinateDecimals: 0 }).coordinateDecimals).toBe(0);
    expect(createConfig({ coordinateDecimals: 6 }).coordinateDecimals).toBe(6);
    for (const bad of [Number.NaN, -1, 0.5, Number.POSITIVE_INFINITY]) {
      expect(() => createConfig({ coordinateDecimals: bad })).toThrow(/coordinateDecimals must be a non-negative integer/);
    }
    expect(() => createConfig({ coordinateDecimals: 7 })).toThrow(/coordinateDecimals must be at most 6/);
  });

  it('searchResultLimit above the provider maximum of 100 is rejected; 100 is accepted', () => {
    expect(createConfig({ searchResultLimit: MAX_SEARCH_RESULT_LIMIT }).searchResultLimit).toBe(100);
    expect(() => createConfig({ searchResultLimit: MAX_SEARCH_RESULT_LIMIT + 1 })).toThrow(/searchResultLimit must be at most 100/);
  });

  it('qualifiedSearchFetchLimit must be a positive integer and at most the provider maximum of 100', () => {
    expect(createConfig({ qualifiedSearchFetchLimit: MAX_SEARCH_RESULT_LIMIT }).qualifiedSearchFetchLimit).toBe(100);
    expect(() => createConfig({ qualifiedSearchFetchLimit: MAX_SEARCH_RESULT_LIMIT + 1 })).toThrow(/qualifiedSearchFetchLimit must be at most 100/);
    for (const bad of [Number.NaN, -1, 0, 1.5]) {
      expect(() => createConfig({ qualifiedSearchFetchLimit: bad })).toThrow(/qualifiedSearchFetchLimit must be a positive integer/);
    }
  });

  it('forecastDays above the provider maximum is rejected', () => {
    expect(createConfig({ forecastDays: MAX_PROVIDER_FORECAST_DAYS }).forecastDays).toBe(16);
    expect(() => createConfig({ forecastDays: MAX_PROVIDER_FORECAST_DAYS + 1 })).toThrow(/forecastDays must be at most 16/);
  });

  it('breakpoints must be positive integers in increasing order, above the minimum width', () => {
    expect(() => createConfig({ breakpoints: { wide: 0 } })).toThrow(/breakpoints.wide must be a positive integer/);
    expect(() => createConfig({ breakpoints: { extraWide: 1.5 } })).toThrow(/breakpoints.extraWide must be a positive integer/);
    expect(() => createConfig({ breakpoints: { wide: 1024, extraWide: 1024 } })).toThrow(/wide must be smaller than breakpoints.extraWide/);
    expect(() => createConfig({ breakpoints: { wide: 300 } })).toThrow(/minViewportWidthPx must be smaller than breakpoints.wide/);
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

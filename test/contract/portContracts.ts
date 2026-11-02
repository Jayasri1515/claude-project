/**
 * Shared port contract tests (impl-plan T-13). Each function registers the same assertions for ANY implementation of a
 * port, so the test fakes and, later, the real adapters (T-30 to T-32) are held to one contract: a port returns a
 * Result instead of throwing, an aborted request settles as `aborted` (never as a network error), and the store and
 * clock behave as the services expect. Adapters call these from their own test files with a factory that wires a stub
 * transport.
 */
import { describe, expect, it } from 'vitest';
import type { Clock, GeocodingProvider, KeyValueStore, LocationService, WeatherProvider } from '../../src/core/ports';
import type { Result } from '../../src/core/result';
import { sampleCoords } from '../fixtures/domain';

function expectResultShape(value: Result<unknown, unknown>): void {
  expect(typeof value.ok).toBe('boolean');
  if (value.ok) expect(value).toHaveProperty('value');
  else expect(value).toHaveProperty('error');
}

function errorKind(value: Result<unknown, { kind: string }>): string | undefined {
  return value.ok ? undefined : value.error.kind;
}

export function weatherProviderContract(name: string, make: () => WeatherProvider): void {
  describe(`WeatherProvider contract: ${name}`, () => {
    it('get resolves to a Result', async () => {
      expectResultShape(await make().get(sampleCoords, new AbortController().signal));
    });

    it('an already aborted signal settles as aborted', async () => {
      const ac = new AbortController();
      ac.abort();
      expect(errorKind(await make().get(sampleCoords, ac.signal))).toBe('aborted');
    });
  });
}

export function geocodingProviderContract(name: string, make: () => GeocodingProvider): void {
  describe(`GeocodingProvider contract: ${name}`, () => {
    it('search resolves to a Result', async () => {
      expectResultShape(await make().search('anything', 5, new AbortController().signal));
    });

    it('an already aborted signal settles as aborted', async () => {
      const ac = new AbortController();
      ac.abort();
      expect(errorKind(await make().search('anything', 5, ac.signal))).toBe('aborted');
    });

    it('reverse is optional and, when present, honours abort', async () => {
      const provider = make();
      if (provider.reverse === undefined) return;
      const ac = new AbortController();
      ac.abort();
      expect(errorKind(await provider.reverse(sampleCoords, ac.signal))).toBe('aborted');
    });
  });
}

export function locationServiceContract(name: string, make: () => LocationService): void {
  describe(`LocationService contract: ${name}`, () => {
    it('getPosition resolves to a Result', async () => {
      expectResultShape(await make().getPosition(new AbortController().signal));
    });

    it('an already aborted signal settles as aborted', async () => {
      const ac = new AbortController();
      ac.abort();
      expect(errorKind(await make().getPosition(ac.signal))).toBe('aborted');
    });
  });
}

export function keyValueStoreContract(name: string, make: () => KeyValueStore): void {
  describe(`KeyValueStore contract: ${name}`, () => {
    it('reads a missing key as ok(undefined)', () => {
      expect(make().get('absent')).toEqual({ ok: true, value: undefined });
    });

    it('round-trips a value and removes it', () => {
      const store = make();
      expect(store.set('k', 'v').ok).toBe(true);
      expect(store.get('k')).toEqual({ ok: true, value: 'v' });
      expect(store.remove('k').ok).toBe(true);
      expect(store.get('k')).toEqual({ ok: true, value: undefined });
    });

    it('removing a missing key is not an error', () => {
      expect(make().remove('absent').ok).toBe(true);
    });
  });
}

export function clockContract(name: string, make: () => Clock): void {
  describe(`Clock contract: ${name}`, () => {
    it('now returns a valid Date', () => {
      const now = make().now();
      expect(now).toBeInstanceOf(Date);
      expect(Number.isNaN(now.getTime())).toBe(false);
    });

    it('now returns a fresh object each call, so callers cannot mutate the clock', () => {
      const clock = make();
      const first = clock.now();
      const before = first.getTime();
      first.setFullYear(1990);
      expect(clock.now().getTime()).not.toBe(first.getTime());
      expect(clock.now().getTime()).toBeGreaterThanOrEqual(before - 1000);
    });
  });
}

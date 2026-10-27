import { describe, expect, it } from 'vitest';
import { makeLocationKey, normalizeNamePart } from '../../src/core/favorites/identity';

describe('makeLocationKey', () => {
  it('uses providerId:placeId when a place ID exists', () => {
    expect(makeLocationKey({ providerId: 'p', placeId: '42', name: 'X' })).toBe('p:42');
  });

  it('same place ID gives equal keys regardless of name differences', () => {
    const a = makeLocationKey({ providerId: 'p', placeId: '42', name: 'Paris', country: 'France' });
    const b = makeLocationKey({ providerId: 'p', placeId: '42', name: 'PARIS', country: 'FR' });
    expect(a).toBe(b);
  });

  it('different provider with the same place ID is a different key', () => {
    expect(makeLocationKey({ providerId: 'a', placeId: '1', name: 'X' })).not.toBe(
      makeLocationKey({ providerId: 'b', placeId: '1', name: 'X' }),
    );
  });

  it('falls back to the name form when placeId is missing, empty or blank', () => {
    for (const placeId of [undefined, '', '   ']) {
      expect(makeLocationKey({ providerId: 'p', placeId, name: 'Paris', admin1: 'Ile', country: 'France' })).toBe(
        'name:paris|ile|france',
      );
    }
  });

  it('treats case and whitespace differences as equal', () => {
    const a = makeLocationKey({ providerId: 'p', name: 'New York', admin1: 'New York', country: 'USA' });
    const b = makeLocationKey({ providerId: 'p', name: '  new   YORK ', admin1: 'NEW york', country: ' usa' });
    expect(a).toBe(b);
  });

  it('treats NFC and NFD forms as equal', () => {
    const nfc = 'Zürich';
    const nfd = 'Zürich';
    expect(nfc).not.toBe(nfd);
    expect(makeLocationKey({ providerId: 'p', name: nfc })).toBe(makeLocationKey({ providerId: 'p', name: nfd }));
  });

  it('keeps nearby places with different names distinct (coordinates are not an input)', () => {
    const a = makeLocationKey({ providerId: 'p', name: 'Springfield', admin1: 'A', country: 'US' });
    const b = makeLocationKey({ providerId: 'p', name: 'Springfield Heights', admin1: 'A', country: 'US' });
    expect(a).not.toBe(b);
  });

  it('distinguishes same name in different regions or countries', () => {
    const a = makeLocationKey({ providerId: 'p', name: 'Springfield', admin1: 'Illinois', country: 'US' });
    const b = makeLocationKey({ providerId: 'p', name: 'Springfield', admin1: 'Missouri', country: 'US' });
    expect(a).not.toBe(b);
  });

  it('handles missing optional fields without producing "undefined"', () => {
    const key = makeLocationKey({ providerId: 'p', name: 'Oslo' });
    expect(key).toBe('name:oslo||');
    expect(key).not.toContain('undefined');
  });

  it('missing region and a region that is an empty string give the same key', () => {
    expect(makeLocationKey({ providerId: 'p', name: 'Oslo', admin1: '' })).toBe(
      makeLocationKey({ providerId: 'p', name: 'Oslo' }),
    );
  });

  it('a "|" inside a name cannot collide with a different place (L7)', () => {
    const piped = makeLocationKey({ providerId: 'p', name: 'a|b' });
    const split = makeLocationKey({ providerId: 'p', name: 'a', admin1: 'b' });
    expect(piped).not.toBe(split);
    expect(makeLocationKey({ providerId: 'p', name: 'a|b', admin1: 'c' })).not.toBe(
      makeLocationKey({ providerId: 'p', name: 'a', admin1: 'b|c' }),
    );
    expect(makeLocationKey({ providerId: 'p', name: 'a\\', admin1: 'b' })).not.toBe(
      makeLocationKey({ providerId: 'p', name: 'a', admin1: '\\b' }),
    );
    // Ordinary names keep the documented form, so stored keys stay valid.
    expect(makeLocationKey({ providerId: 'p', name: 'Oslo', country: 'Norway' })).toBe('name:oslo||norway');
  });

  it('supports non-Latin names', () => {
    const a = makeLocationKey({ providerId: 'p', name: '東京', country: '日本' });
    const b = makeLocationKey({ providerId: 'p', name: ' 東京 ', country: '日本' });
    expect(a).toBe(b);
    expect(a).toBe('name:東京||日本');
    expect(makeLocationKey({ providerId: 'p', name: 'Москва' })).toBe(
      makeLocationKey({ providerId: 'p', name: 'москва' }),
    );
  });
});

describe('normalizeNamePart', () => {
  it('returns empty for undefined and whitespace-only', () => {
    expect(normalizeNamePart(undefined)).toBe('');
    expect(normalizeNamePart('  \t ')).toBe('');
  });
});

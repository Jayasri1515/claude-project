import { describe, expect, it } from 'vitest';
import { makeLocationKey, normalizeNamePart } from '../../src/core/favorites/identity';

describe('makeLocationKey', () => {
  it('does not depend on the provider place ID or provider (DR-15)', () => {
    const a = makeLocationKey({ name: 'Paris', admin1: 'Ile', country: 'France' });
    // Extra provider fields passed by a caller are ignored by the rule.
    const withId = makeLocationKey({ name: 'Paris', admin1: 'Ile', country: 'France', placeId: '42', providerId: 'x' } as never);
    expect(withId).toBe(a);
    expect(a).toBe('paris|ile|france');
  });

  it('treats case and whitespace differences as equal', () => {
    const a = makeLocationKey({ name: 'New York', admin1: 'New York', country: 'USA' });
    const b = makeLocationKey({ name: '  new   YORK ', admin1: 'NEW york', country: ' usa' });
    expect(a).toBe(b);
  });

  it('treats NFC and NFD forms as equal', () => {
    const nfc = 'Zürich';
    const nfd = 'Zürich';
    expect(nfc).not.toBe(nfd);
    expect(makeLocationKey({ name: nfc })).toBe(makeLocationKey({ name: nfd }));
  });

  it('keeps nearby places with different names distinct (coordinates are not an input)', () => {
    const a = makeLocationKey({ name: 'Springfield', admin1: 'A', country: 'US' });
    const b = makeLocationKey({ name: 'Springfield Heights', admin1: 'A', country: 'US' });
    expect(a).not.toBe(b);
  });

  it('distinguishes same name in different regions or countries', () => {
    const a = makeLocationKey({ name: 'Springfield', admin1: 'Illinois', country: 'US' });
    const b = makeLocationKey({ name: 'Springfield', admin1: 'Missouri', country: 'US' });
    expect(a).not.toBe(b);
  });

  it('handles missing optional fields without producing "undefined"', () => {
    const key = makeLocationKey({ name: 'Oslo' });
    expect(key).toBe('oslo||');
    expect(key).not.toContain('undefined');
  });

  it('missing region and a region that is an empty string give the same key', () => {
    expect(makeLocationKey({ name: 'Oslo', admin1: '' })).toBe(
      makeLocationKey({ name: 'Oslo' }),
    );
  });

  it('a "|" inside a name cannot collide with a different place (L7)', () => {
    const piped = makeLocationKey({ name: 'a|b' });
    const split = makeLocationKey({ name: 'a', admin1: 'b' });
    expect(piped).not.toBe(split);
    expect(makeLocationKey({ name: 'a|b', admin1: 'c' })).not.toBe(
      makeLocationKey({ name: 'a', admin1: 'b|c' }),
    );
    expect(makeLocationKey({ name: 'a\\', admin1: 'b' })).not.toBe(
      makeLocationKey({ name: 'a', admin1: '\\b' }),
    );
    // Ordinary names keep the documented form, so stored keys stay valid.
    expect(makeLocationKey({ name: 'Oslo', country: 'Norway' })).toBe('oslo||norway');
  });

  it('supports non-Latin names', () => {
    const a = makeLocationKey({ name: '東京', country: '日本' });
    const b = makeLocationKey({ name: ' 東京 ', country: '日本' });
    expect(a).toBe(b);
    expect(a).toBe('東京||日本');
    expect(makeLocationKey({ name: 'Москва' })).toBe(
      makeLocationKey({ name: 'москва' }),
    );
  });
});

describe('normalizeNamePart', () => {
  it('returns empty for undefined and whitespace-only', () => {
    expect(normalizeNamePart(undefined)).toBe('');
    expect(normalizeNamePart('  \t ')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { createConfig } from '../../src/core/config';
import type { Location } from '../../src/core/domain';
import { FAVORITES_STORAGE_KEY, FavoritesService } from '../../src/core/favorites/favoritesService';
import { sampleLocation } from '../fixtures/domain';
import { InMemoryKeyValueStore } from '../fakes';

const place = (n: number, extra: Partial<Location> = {}): Location => ({
  ...sampleLocation,
  key: `test:${n}`,
  placeId: String(n),
  name: `Place ${n}`,
  ...extra,
});

function make(store = new InMemoryKeyValueStore(), overrides = {}) {
  return { store, service: new FavoritesService({ store, config: createConfig(overrides) }) };
}

describe('FavoritesService basics', () => {
  it('starts empty and adds in insertion order', () => {
    const { service } = make();
    expect(service.list()).toEqual([]);
    expect(service.add(place(2))).toBe('added');
    expect(service.add(place(1))).toBe('added');
    expect(service.list().map((f) => f.key)).toEqual(['test:2', 'test:1']);
  });

  it('rejects duplicates by key, whatever the coordinates', () => {
    const { service } = make();
    service.add(place(1));
    expect(service.add(place(1, { latitude: 50, longitude: 50 }))).toBe('duplicate');
    expect(service.list()).toHaveLength(1);
  });

  it('removes by key and reports unknown keys', () => {
    const { service } = make();
    service.add(place(1));
    service.add(place(2));
    expect(service.remove('test:1')).toBe(true);
    expect(service.remove('test:1')).toBe(false);
    expect(service.list().map((f) => f.key)).toEqual(['test:2']);
    expect(service.isFavorite('test:2')).toBe(true);
    expect(service.isFavorite('test:1')).toBe(false);
  });

  it('allows re-adding after removal (removal of the displayed favorite re-enables add)', () => {
    const { service } = make();
    service.add(place(1));
    service.remove('test:1');
    expect(service.add(place(1))).toBe('added');
  });

  it('list() returns a copy', () => {
    const { service } = make();
    service.add(place(1));
    (service.list() as Location[]).pop();
    expect(service.list()).toHaveLength(1);
  });

  it('enforces maxFavorites when configured, and is unbounded otherwise', () => {
    const capped = make(undefined, { maxFavorites: 2 }).service;
    expect(capped.add(place(1))).toBe('added');
    expect(capped.add(place(2))).toBe('added');
    expect(capped.add(place(3))).toBe('limit-reached');
    expect(capped.list()).toHaveLength(2);
    const unbounded = make().service;
    for (let i = 0; i < 50; i += 1) unbounded.add(place(i));
    expect(unbounded.list()).toHaveLength(50);
  });
});

describe('FavoritesService stored list beyond maxFavorites (L4)', () => {
  it('keeps every valid stored favorite when the cap is lower, and still blocks additions', () => {
    const { store, service } = make();
    for (let i = 1; i <= 4; i += 1) service.add(place(i));
    const reloaded = new FavoritesService({ store, config: createConfig({ maxFavorites: 2 }) });
    expect(reloaded.list().map((f) => f.key)).toEqual(['test:1', 'test:2', 'test:3', 'test:4']);
    expect(reloaded.add(place(5))).toBe('limit-reached');
    reloaded.remove('test:4');
    expect(new FavoritesService({ store, config: createConfig() }).list()).toHaveLength(3);
  });
});

describe('FavoritesService persistence', () => {
  it('a fresh service over the same store restores the list', () => {
    const { store, service } = make();
    service.add(place(1, { admin1: 'Reg', country: 'Land' }));
    service.add(place(2));
    const reloaded = new FavoritesService({ store, config: createConfig() });
    expect(reloaded.list()).toEqual(service.list());
    expect(reloaded.storageUnavailable).toBe(false);
  });

  it('writes the versioned record { v, items } with a centroid (architecture 3.4, DR-15)', () => {
    const { store, service } = make();
    service.add(place(1, { admin1: 'Reg', country: 'Land', timezone: 'Europe/Oslo', latitude: 10.5, longitude: -20.25 }));
    const raw = JSON.parse(store.data.get(FAVORITES_STORAGE_KEY) ?? 'null');
    expect(raw).toEqual({
      v: 1,
      items: [
        {
          key: 'test:1',
          providerId: '1',
          name: 'Place 1',
          admin1: 'Reg',
          country: 'Land',
          centroid: { lat: 10.5, lon: -20.25 },
          timeZoneHint: 'Europe/Oslo',
        },
      ],
    });
    expect(raw).not.toHaveProperty('version');
    expect(raw).not.toHaveProperty('favorites');
  });

  it('removal is persisted', () => {
    const { store, service } = make();
    service.add(place(1));
    service.remove('test:1');
    expect(new FavoritesService({ store, config: createConfig() }).list()).toEqual([]);
  });

  const item = (n: number, extra: Record<string, unknown> = {}) => ({
    key: `test:${n}`,
    name: `Place ${n}`,
    centroid: { lat: n, lon: n * 2 },
    ...extra,
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['non-object JSON', '42'],
    ['null', 'null'],
    ['wrong version', JSON.stringify({ v: 2, items: [item(1)] })],
    ['missing version', JSON.stringify({ items: [item(1)] })],
    ['items not an array', JSON.stringify({ v: 1, items: 'x' })],
    // The earlier { version, favorites } shape is not migrated: it is treated as unreadable (documented choice).
    ['old { version, favorites } shape', JSON.stringify({ version: 1, favorites: [place(1)] })],
    ['an item with an out-of-range centroid', JSON.stringify({ v: 1, items: [item(1), item(2, { centroid: { lat: 999, lon: 0 } })] })],
    ['an item without a name', JSON.stringify({ v: 1, items: [item(1, { name: '' })] })],
    ['an item with a wrongly typed field', JSON.stringify({ v: 1, items: [item(1, { country: 7 })] })],
    ['a non-object item', JSON.stringify({ v: 1, items: [item(1), 'junk'] })],
    ['duplicate keys', JSON.stringify({ v: 1, items: [item(1), item(1)] })],
  ])('discards a %s record, starts empty, raises the corruption flag and does not crash (REQ-WF6-06)', (_name, raw) => {
    const store = new InMemoryKeyValueStore({ [FAVORITES_STORAGE_KEY]: raw });
    const { service } = make(store);
    expect(service.list()).toEqual([]);
    expect(service.dataDiscarded).toBe(true);
    expect(service.storageUnavailable).toBe(false);
    expect(service.add(place(1))).toBe('added'); // still usable, overwrites the bad record
    expect(new FavoritesService({ store, config: createConfig() }).list().map((f) => f.key)).toEqual(['test:1']);
    expect(new FavoritesService({ store, config: createConfig() }).dataDiscarded).toBe(false);
  });

  it('valid data and an empty store do not raise the corruption flag', () => {
    expect(make().service.dataDiscarded).toBe(false);
    const { store, service } = make();
    service.add(place(1));
    expect(new FavoritesService({ store, config: createConfig() }).dataDiscarded).toBe(false);
  });

  it('reads a stored item back into the same place (round trip, optional fields kept)', () => {
    const store = new InMemoryKeyValueStore({
      [FAVORITES_STORAGE_KEY]: JSON.stringify({
        v: 1,
        items: [item(1, { providerId: '77', admin1: 'R', country: 'C', timeZoneHint: 'Europe/Oslo' }), item(2)],
      }),
    });
    const { service } = make(store);
    expect(service.dataDiscarded).toBe(false);
    expect(service.list()).toEqual([
      {
        key: 'test:1',
        name: 'Place 1',
        latitude: 1,
        longitude: 2,
        source: 'search',
        admin1: 'R',
        country: 'C',
        timezone: 'Europe/Oslo',
        placeId: '77',
      },
      { key: 'test:2', name: 'Place 2', latitude: 2, longitude: 4, source: 'search' },
    ]);
  });

  it('a read failure keeps working in memory and raises the notice', () => {
    const store = new InMemoryKeyValueStore();
    store.fail.get = true;
    const { service } = make(store);
    expect(service.storageUnavailable).toBe(true);
    expect(service.list()).toEqual([]);
    expect(service.add(place(1))).toBe('added');
    expect(service.list()).toHaveLength(1);
  });

  it('a write failure keeps the in-memory list and raises the notice; recovery clears it', () => {
    const { store, service } = make();
    store.fail.set = true;
    expect(service.add(place(1))).toBe('added');
    expect(service.storageUnavailable).toBe(true);
    expect(service.list()).toHaveLength(1);
    expect(service.add(place(1))).toBe('duplicate');
    store.fail.set = false;
    service.add(place(2));
    expect(service.storageUnavailable).toBe(false);
    expect(new FavoritesService({ store, config: createConfig() }).list()).toHaveLength(2);
  });
});

describe('FavoritesService device-location rule (F-004)', () => {
  const DEVICE_LAT = 11.111111;
  const DEVICE_LON = 22.222222;
  const deviceLocation: Location = {
    key: 'device:current',
    name: 'Current location',
    latitude: DEVICE_LAT,
    longitude: DEVICE_LON,
    source: 'device',
  };

  it('rejects a device location and writes nothing', () => {
    const { store, service } = make();
    expect(service.add(deviceLocation)).toBe('device-location-not-allowed');
    expect(service.list()).toEqual([]);
    expect(store.setCalls).toBe(0);
  });

  it('rejects a device location even when it carries a resolved name', () => {
    const { service } = make();
    expect(service.add({ ...deviceLocation, name: 'Named', key: 'p:9' })).toBe('device-location-not-allowed');
  });

  it('a resolved named place (source "search") is saved with its own coordinates; the device location offered alongside is not', () => {
    const { store, service } = make();
    // The device location is offered first (and refused), then the resolved place. If the refusal
    // were removed, the device coordinates would be in the stored record and this test would fail.
    expect(service.add(deviceLocation)).toBe('device-location-not-allowed');
    expect(service.add({ ...deviceLocation, name: 'Named', key: 'p:8' })).toBe('device-location-not-allowed');
    const resolved = place(9, { latitude: 10.5, longitude: -20.25 });
    expect(service.add(resolved)).toBe('added');
    const stored = store.data.get(FAVORITES_STORAGE_KEY) ?? '';
    expect(JSON.parse(stored).items).toHaveLength(1);
    expect(stored).toContain('10.5');
    expect(stored).not.toContain(String(DEVICE_LAT));
    expect(stored).not.toContain(String(DEVICE_LON));
  });

  it('persists only known fields', () => {
    const { store, service } = make();
    service.add({ ...place(1), extra: 'secret' } as Location);
    expect(store.data.get(FAVORITES_STORAGE_KEY)).not.toContain('secret');
  });
});

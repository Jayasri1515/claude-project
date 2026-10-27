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

  it('writes a versioned record', () => {
    const { store, service } = make();
    service.add(place(1));
    const raw = JSON.parse(store.data.get(FAVORITES_STORAGE_KEY) ?? 'null');
    expect(raw.version).toBe(1);
    expect(raw.favorites).toHaveLength(1);
  });

  it('removal is persisted', () => {
    const { store, service } = make();
    service.add(place(1));
    service.remove('test:1');
    expect(new FavoritesService({ store, config: createConfig() }).list()).toEqual([]);
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['non-object JSON', '42'],
    ['null', 'null'],
    ['wrong version', JSON.stringify({ version: 2, favorites: [place(1)] })],
    ['missing version', JSON.stringify({ favorites: [place(1)] })],
    ['favorites not an array', JSON.stringify({ version: 1, favorites: 'x' })],
  ])('ignores a %s record and starts empty without crashing', (_name, raw) => {
    const store = new InMemoryKeyValueStore({ [FAVORITES_STORAGE_KEY]: raw });
    const { service } = make(store);
    expect(service.list()).toEqual([]);
    expect(service.storageUnavailable).toBe(false);
    expect(service.add(place(1))).toBe('added'); // still usable, overwrites the bad record
  });

  it('skips invalid and duplicate entries but keeps valid ones', () => {
    const good = place(1);
    const record = {
      version: 1,
      favorites: [
        good,
        good,
        { ...place(2), latitude: 999 },
        { ...place(3), name: '' },
        { ...place(4), source: 'device' },
        { ...place(5), country: 7 },
        'junk',
        null,
        place(6),
      ],
    };
    const store = new InMemoryKeyValueStore({ [FAVORITES_STORAGE_KEY]: JSON.stringify(record) });
    expect(make(store).service.list().map((f) => f.key)).toEqual(['test:1', 'test:6']);
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
    expect(JSON.parse(stored).favorites).toHaveLength(1);
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

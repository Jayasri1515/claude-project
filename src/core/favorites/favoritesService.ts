/**
 * Favorites Service (C6, architecture 3.4 and DR-15; FR-032 to FR-039, EC-014 to EC-017, NFR-005; impl-plan T-22).
 *
 * Persists a versioned JSON record `{ "v": 1, "items": [...] }` through KeyValueStore. Each item is
 * `{ key, providerId?, name, admin1?, country?, centroid: {lat, lon}, timeZoneHint? }`: the stored shape of a `Place`.
 * In memory the service still works with the legacy `Location` shape (`latitude`, `longitude`, `placeId`, `timezone`);
 * the two are mapped at the storage boundary, and `placeId` is stored as the informational `providerId`.
 *
 * A read with an unknown or missing version, an unparseable value, or any invalid or duplicate item (this includes the
 * earlier `{version, favorites}` shape, which the architecture does not migrate) discards the data and raises
 * `dataDiscarded`, so the UI can show the corruption notice M-16 (REQ-WF6-06). The service then starts empty and adding
 * works normally; the next save overwrites the bad record.
 *
 * If storage is unavailable the list lives in memory for the session and `storageUnavailable` is raised so the UI can
 * show a non-blocking notice. A `source: 'device'` location is never saved; only a resolved named place
 * (`source: 'search'`) can be a favorite, so raw device coordinates are never written (F-004).
 */
import type { Config } from '../config';
import type { Location } from '../domain';
import type { KeyValueStore } from '../ports';

export const FAVORITES_STORAGE_KEY = 'weather-app.favorites';
export const FAVORITES_RECORD_VERSION = 1;

export type AddFavoriteOutcome = 'added' | 'duplicate' | 'limit-reached' | 'device-location-not-allowed';

export interface FavoritesServiceDeps {
  readonly store: KeyValueStore;
  readonly config: Pick<Config, 'maxFavorites'>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null; // null marks an invalid type
}

/** Validate one stored item and map it to the in-memory shape; undefined if it is not a usable saved place. */
function parseItem(raw: unknown): Location | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const { key, name, centroid } = r;
  if (typeof key !== 'string' || key === '' || typeof name !== 'string' || name.trim() === '') return undefined;
  if (typeof centroid !== 'object' || centroid === null) return undefined;
  const { lat, lon } = centroid as Record<string, unknown>;
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) return undefined;
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) return undefined;
  const admin1 = optionalString(r['admin1']);
  const country = optionalString(r['country']);
  const timeZoneHint = optionalString(r['timeZoneHint']);
  const providerId = optionalString(r['providerId']);
  if (admin1 === null || country === null || timeZoneHint === null || providerId === null) return undefined;
  return {
    key,
    name,
    latitude: lat,
    longitude: lon,
    source: 'search',
    ...(admin1 !== undefined ? { admin1 } : {}),
    ...(country !== undefined ? { country } : {}),
    ...(timeZoneHint !== undefined ? { timezone: timeZoneHint } : {}),
    ...(providerId !== undefined ? { placeId: providerId } : {}),
  };
}

/** The in-memory copy of a saved place: known fields only, always `source: 'search'`. */
function toKept(location: Location): Location {
  return {
    key: location.key,
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    source: 'search',
    ...(location.admin1 !== undefined ? { admin1: location.admin1 } : {}),
    ...(location.country !== undefined ? { country: location.country } : {}),
    ...(location.timezone !== undefined ? { timezone: location.timezone } : {}),
    ...(location.placeId !== undefined ? { placeId: location.placeId } : {}),
  };
}

/** Only known fields are persisted, so nothing extra can leak into storage. */
function toStoredItem(location: Location): Record<string, unknown> {
  return {
    key: location.key,
    ...(location.placeId !== undefined ? { providerId: location.placeId } : {}),
    name: location.name,
    ...(location.admin1 !== undefined ? { admin1: location.admin1 } : {}),
    ...(location.country !== undefined ? { country: location.country } : {}),
    centroid: { lat: location.latitude, lon: location.longitude },
    ...(location.timezone !== undefined ? { timeZoneHint: location.timezone } : {}),
  };
}

export class FavoritesService {
  private readonly store: KeyValueStore;
  private readonly config: Pick<Config, 'maxFavorites'>;
  private favorites: Location[] = [];
  private storageProblem = false;
  private discarded = false;

  /** Loads and validates the stored record. Never throws. */
  constructor(deps: FavoritesServiceDeps) {
    this.store = deps.store;
    this.config = deps.config;
    this.load();
  }

  /** Favorites in insertion order. */
  list(): readonly Location[] {
    return [...this.favorites];
  }

  isFavorite(key: string): boolean {
    return this.favorites.some((f) => f.key === key);
  }

  /** True when the last load or save failed: favorites may not persist (EC-016). */
  get storageUnavailable(): boolean {
    return this.storageProblem;
  }

  /** True when the stored data was unreadable and was discarded at load (M-16, REQ-WF6-06). */
  get dataDiscarded(): boolean {
    return this.discarded;
  }

  add(location: Location): AddFavoriteOutcome {
    if (location.source === 'device') return 'device-location-not-allowed';
    if (this.isFavorite(location.key)) return 'duplicate';
    const max = this.config.maxFavorites;
    if (max !== undefined && this.favorites.length >= max) return 'limit-reached';
    this.favorites = [...this.favorites, toKept(location)];
    this.save();
    return 'added';
  }

  /** Remove by key. Returns false if it was not a favorite. Display state is not this service's concern. */
  remove(key: string): boolean {
    if (!this.isFavorite(key)) return false;
    this.favorites = this.favorites.filter((f) => f.key !== key);
    this.save();
    return true;
  }

  private load(): void {
    const read = this.store.get(FAVORITES_STORAGE_KEY);
    if (!read.ok) {
      this.storageProblem = true;
      return;
    }
    if (read.value === undefined) return;
    const loaded = this.parse(read.value);
    if (loaded === undefined) {
      this.discarded = true; // unreadable: start empty and say so
      return;
    }
    // Valid saved favorites are never dropped, even if a lowered cap is now
    // exceeded: dropping would lose user data on the next save. The cap only
    // blocks further additions (see add()).
    this.favorites = loaded;
  }

  /** The stored list, or undefined when the record is unreadable in any way (the caller discards it). */
  private parse(value: string): Location[] | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (record['v'] !== FAVORITES_RECORD_VERSION || !Array.isArray(record['items'])) return undefined;
    const seen = new Set<string>();
    const loaded: Location[] = [];
    for (const raw of record['items'] as unknown[]) {
      const location = parseItem(raw);
      if (location === undefined || seen.has(location.key)) return undefined; // invalid item or duplicate key
      seen.add(location.key);
      loaded.push(location);
    }
    return loaded;
  }

  private save(): void {
    const record = { v: FAVORITES_RECORD_VERSION, items: this.favorites.map(toStoredItem) };
    const written = this.store.set(FAVORITES_STORAGE_KEY, JSON.stringify(record));
    this.storageProblem = !written.ok;
  }
}

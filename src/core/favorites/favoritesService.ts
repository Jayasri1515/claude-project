/**
 * Favorites Service (C7, architecture 4.7 and Flow D; FR-032 to FR-039,
 * EC-014 to EC-017, NFR-005).
 *
 * Persists a versioned JSON record `{ "version": 1, "favorites": [...] }`
 * through KeyValueStore. If storage is unavailable the list lives in memory for
 * the session and `storageUnavailable` is raised so the UI can show a
 * non-blocking notice. A `source: 'device'` location is never saved; only a
 * resolved named place (`source: 'search'`) can be a favorite, so raw device
 * coordinates are never written (F-004).
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

/** Validate one stored entry; undefined if it is not a usable saved place. */
function parseLocation(raw: unknown): Location | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const { key, name, latitude, longitude } = r;
  if (typeof key !== 'string' || key === '' || typeof name !== 'string' || name.trim() === '') return undefined;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return undefined;
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) return undefined;
  if (r['source'] !== 'search') return undefined; // 'device' entries are never valid favorites
  const admin1 = optionalString(r['admin1']);
  const country = optionalString(r['country']);
  const timezone = optionalString(r['timezone']);
  const placeId = optionalString(r['placeId']);
  if (admin1 === null || country === null || timezone === null || placeId === null) return undefined;
  return {
    key,
    name,
    latitude,
    longitude,
    source: 'search',
    ...(admin1 !== undefined ? { admin1 } : {}),
    ...(country !== undefined ? { country } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
    ...(placeId !== undefined ? { placeId } : {}),
  };
}

/** Only known fields are persisted, so nothing extra can leak into storage. */
function toStored(location: Location): Location {
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

export class FavoritesService {
  private readonly store: KeyValueStore;
  private readonly config: Pick<Config, 'maxFavorites'>;
  private favorites: Location[] = [];
  private storageProblem = false;

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

  add(location: Location): AddFavoriteOutcome {
    if (location.source === 'device') return 'device-location-not-allowed';
    if (this.isFavorite(location.key)) return 'duplicate';
    const max = this.config.maxFavorites;
    if (max !== undefined && this.favorites.length >= max) return 'limit-reached';
    this.favorites = [...this.favorites, toStored(location)];
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(read.value);
    } catch {
      return; // corrupt record: ignored, start empty
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const record = parsed as Record<string, unknown>;
    if (record['version'] !== FAVORITES_RECORD_VERSION || !Array.isArray(record['favorites'])) return;

    const seen = new Set<string>();
    const loaded: Location[] = [];
    for (const raw of record['favorites'] as unknown[]) {
      const location = parseLocation(raw);
      if (location === undefined || seen.has(location.key)) continue; // skip invalid or duplicate entries
      seen.add(location.key);
      loaded.push(location);
    }
    // Valid saved favorites are never dropped, even if a lowered cap is now
    // exceeded: dropping would lose user data on the next save. The cap only
    // blocks further additions (see add()).
    this.favorites = loaded;
  }

  private save(): void {
    const record = { version: FAVORITES_RECORD_VERSION, favorites: this.favorites };
    const written = this.store.set(FAVORITES_STORAGE_KEY, JSON.stringify(record));
    this.storageProblem = !written.ok;
  }
}

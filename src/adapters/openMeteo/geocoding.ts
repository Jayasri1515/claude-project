/**
 * GeocodingProvider.search over the Open-Meteo Geocoding API (TASK-022).
 *
 * Endpoint, parameters and response shape were checked against the official
 * documentation on 2026-10-27 (https://open-meteo.com/en/docs/geocoding-api; see
 * impl-plan TASK-022 for what was checked):
 *   GET https://geocoding-api.open-meteo.com/v1/search?name=<text>&count=<1..100>&language=en&format=json
 *   success: { results?: [{ id, name, latitude, longitude, timezone?, country?, admin1?, ... }] }
 *            "Empty fields are not returned"; a search with no match has NO `results` key.
 *   failure: HTTP 400 with { error: true, reason: "..." } (the reason text is never shown).
 *
 * No API key is used or accepted. The user's text goes into the query string
 * through URLSearchParams, so it is always percent-encoded. There is no reverse
 * geocoding endpoint, so this class deliberately has no `reverse` method and the
 * composition must not wire one (device locations stay "Current location").
 *
 * Each result is validated one by one: an entry without a name or with unusable
 * coordinates is skipped, an unexpected top-level shape is a service failure.
 * Provider text is only ever returned as data (the UI renders it as text).
 */
import type { Location } from '../../core/domain';
import { serviceUnavailable } from '../../core/errors';
import type { AppError } from '../../core/errors';
import { makeLocationKey } from '../../core/favorites/identity';
import type { GeocodingProvider } from '../../core/ports';
import { err, ok } from '../../core/result';
import type { Result } from '../../core/result';
import { defaultFetch, finiteNumber, getJson, isRecord, nonEmptyString } from './http';
import type { FetchLike, OpenMeteoOptions } from './http';

export const GEOCODING_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
/** Identifies this provider in `Location.key` ("open-meteo:<id>"). */
export const PROVIDER_ID = 'open-meteo';
/** Documented maximum for `count`. */
const MAX_COUNT = 100;

export function parseGeocodingResult(raw: unknown): Location | undefined {
  if (!isRecord(raw)) return undefined;
  const name = nonEmptyString(raw['name']);
  const latitude = finiteNumber(raw['latitude']);
  const longitude = finiteNumber(raw['longitude']);
  if (name === undefined || latitude === undefined || longitude === undefined) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;

  const id = raw['id'];
  const placeId =
    typeof id === 'number' && Number.isSafeInteger(id) ? String(id) : typeof id === 'string' ? nonEmptyString(id) : undefined;
  const admin1 = nonEmptyString(raw['admin1']);
  const country = nonEmptyString(raw['country']);
  const timezone = nonEmptyString(raw['timezone']);

  return {
    key: makeLocationKey({
      providerId: PROVIDER_ID,
      name,
      ...(placeId !== undefined ? { placeId } : {}),
      ...(admin1 !== undefined ? { admin1 } : {}),
      ...(country !== undefined ? { country } : {}),
    }),
    name,
    ...(admin1 !== undefined ? { admin1 } : {}),
    ...(country !== undefined ? { country } : {}),
    latitude,
    longitude,
    ...(timezone !== undefined ? { timezone } : {}),
    ...(placeId !== undefined ? { placeId } : {}),
    source: 'search',
  };
}

export class OpenMeteoGeocodingProvider implements GeocodingProvider {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number | undefined;

  constructor(options: OpenMeteoOptions = {}) {
    this.fetchFn = options.fetch ?? defaultFetch;
    this.timeoutMs = options.timeoutMs;
  }

  async search(query: string, limit: number, signal?: AbortSignal): Promise<Result<Location[], AppError>> {
    try {
      const count = Number.isFinite(limit) ? Math.min(MAX_COUNT, Math.max(1, Math.trunc(limit))) : MAX_COUNT;
      const url = new URL(GEOCODING_SEARCH_URL);
      url.searchParams.set('name', query);
      url.searchParams.set('count', String(count));
      url.searchParams.set('language', 'en');
      url.searchParams.set('format', 'json');

      const response = await getJson(url.toString(), { fetch: this.fetchFn, timeoutMs: this.timeoutMs, signal });
      if (!response.ok) return response;

      const body = response.value;
      if (!isRecord(body) || body['error'] === true) return err(serviceUnavailable());
      const results = body['results'];
      if (results === undefined) return ok([]); // documented: no match means no `results` key
      if (!Array.isArray(results)) return err(serviceUnavailable());

      const locations: Location[] = [];
      for (const entry of results as unknown[]) {
        const location = parseGeocodingResult(entry);
        if (location !== undefined) locations.push(location);
        if (locations.length >= count) break;
      }
      return ok(locations);
    } catch {
      // Defensive: the port never throws.
      return err(serviceUnavailable());
    }
  }
}

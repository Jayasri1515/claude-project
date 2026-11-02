/**
 * Approved domain model (architecture 3.1, impl-plan T-12): Coordinates, Place, SelectedLocation, Current, Day,
 * WeatherResult. These are type-level checks (`npm run typecheck` fails if one stops holding) plus a few runtime
 * assertions so the file is also a vitest test.
 */
import { describe, expect, it } from 'vitest';
import type {
  Coordinates,
  Current,
  Day,
  Place,
  SelectedLocation,
  WeatherResult,
} from '../../src/core/domain';
import { notFound } from '../../src/core/errors';
import { err, ok } from '../../src/core/result';
import type { Coordinates as PortCoordinates } from '../../src/core/ports/locationService';

const centroid: Coordinates = { lat: 52.52, lon: 13.41 };

describe('approved domain model', () => {
  it('Place needs key, name and centroid; the rest is optional', () => {
    const minimal: Place = { key: 'berlin||germany', name: 'Berlin', centroid };
    const full: Place = {
      key: 'berlin|berlin|germany',
      providerId: '2950159',
      name: 'Berlin',
      admin1: 'Berlin',
      country: 'Germany',
      centroid,
      timeZoneHint: 'Europe/Berlin',
    };
    expect(minimal.centroid).toEqual(full.centroid);

    // @ts-expect-error a Place without a centroid does not compile.
    const noCentroid: Place = { key: 'k', name: 'X' };
    expect(noCentroid.key).toBe('k');
  });

  it('SelectedLocation is a place (with origin) or a device location whose coordinates stay out of Place', () => {
    const place: Place = { key: 'k', name: 'X', centroid };
    const fromSearch: SelectedLocation = { kind: 'place', place, origin: 'search' };
    const fromFavorite: SelectedLocation = { kind: 'place', place, origin: 'favorite' };
    const device: SelectedLocation = { kind: 'device', deviceCoords: centroid };
    const deviceWithPlace: SelectedLocation = { kind: 'device', deviceCoords: centroid, place };
    expect([fromSearch, fromFavorite, device, deviceWithPlace].map((l) => l.kind)).toEqual(['place', 'place', 'device', 'device']);

    // @ts-expect-error a place selection needs an origin.
    const noOrigin: SelectedLocation = { kind: 'place', place };
    // @ts-expect-error a device selection needs its coordinates.
    const noCoords: SelectedLocation = { kind: 'device' };
    // @ts-expect-error an unknown kind does not compile.
    const other: SelectedLocation = { kind: 'saved', place };
    expect([noOrigin.kind, noCoords.kind, other.kind]).toHaveLength(3);
  });

  it('Place has no field that can hold device coordinates', () => {
    // @ts-expect-error `deviceCoords` is not a Place property (excess property check).
    const bad: Place = { key: 'k', name: 'X', centroid, deviceCoords: centroid };
    expect(bad.name).toBe('X');
  });

  it('Current and Day allow every measured field to be absent', () => {
    const emptyCurrent: Current = {};
    const current: Current = { tempCanonical: 12.3, humidityPct: 55, conditionCategory: 'DRIZZLE', isDay: false };
    const day: Day = { localDate: '2026-10-30' };
    const fullDay: Day = { localDate: '2026-10-30', highCanonical: 14, lowCanonical: 6, conditionCategory: 'RAIN' };
    expect(emptyCurrent.isDay).toBeUndefined();
    expect(current.isDay).toBe(false);
    expect(day.highCanonical).toBeUndefined();
    expect(fullDay.lowCanonical).toBe(6);

    // @ts-expect-error a Day needs its local date.
    const noDate: Day = { highCanonical: 1 };
    expect(noDate.highCanonical).toBe(1);
  });

  it('WeatherResult holds two independent section results and an optional time zone', () => {
    const both: WeatherResult = {
      timeZone: 'Europe/Berlin',
      current: ok({ tempCanonical: 10 }),
      forecast: ok([{ localDate: '2026-10-30' }]),
    };
    const oneFailed: WeatherResult = { current: ok({}), forecast: err(notFound()) };
    expect(both.current.ok && both.forecast.ok).toBe(true);
    expect(oneFailed.timeZone).toBeUndefined();
    expect(oneFailed.forecast.ok).toBe(false);
  });

  it('the location-service port re-exports the same Coordinates type', () => {
    const viaPort: PortCoordinates = centroid;
    const back: Coordinates = viaPort;
    expect(back).toBe(centroid);
  });
});

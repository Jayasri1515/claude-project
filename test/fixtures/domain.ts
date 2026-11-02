import type {
  Coordinates,
  Current,
  Day,
  Location,
  Place,
  WeatherResult,
  WeatherView,
} from '../../src/core/domain';
import { placeLabel } from '../../src/core/placeLabel';
import { ok } from '../../src/core/result';

/** Shared fixtures for later tasks. Values are invented test data, not provider facts. */

/** Approved-model fixtures (T-12/T-13): a named place, coordinates and a weather result. */
export const sampleCoords: Coordinates = { lat: 10.5, lon: -20.25 };

export const samplePlace: Place = {
  key: 'place:test-1',
  name: 'Placeholder City',
  admin1: 'Placeholder Region',
  country: 'Placeland',
  centroid: sampleCoords,
  timeZoneHint: 'Etc/UTC',
};

export const sampleWeatherResult: WeatherResult = {
  timeZone: 'Etc/UTC',
  current: ok({ tempCanonical: 21.5, humidityPct: 60, conditionCategory: 'PARTLY_CLOUDY', isDay: true }),
  forecast: ok([{ localDate: '2026-01-02', highCanonical: 20, lowCanonical: 10, conditionCategory: 'CLEAR' }]),
};

/** Legacy-model fixtures (kept until the legacy types are removed in Phase 2). */
export const sampleLocation: Location = {
  key: 'test:1',
  name: 'Placeholder City',
  admin1: 'Testshire',
  country: 'Testland',
  latitude: 10.5,
  longitude: -20.25,
  timezone: 'Etc/UTC',
  placeId: '1',
  source: 'search',
};

export const sampleCurrent: Current = {
  tempCanonical: 21.5,
  humidityPct: 60,
  conditionCategory: 'PARTLY_CLOUDY',
};

export const sampleForecast: Day[] = [
  { localDate: '2026-01-02', lowCanonical: 10, highCanonical: 20, conditionCategory: 'CLEAR' },
  { localDate: '2026-01-03', lowCanonical: 11, highCanonical: 19, conditionCategory: 'RAIN' },
  { localDate: '2026-01-04', lowCanonical: 9, highCanonical: 15, conditionCategory: 'CLOUDY' },
];

export const sampleSnapshot: WeatherView = {
  key: sampleLocation.key,
  label: placeLabel(sampleLocation),
  current: { status: 'ready', data: sampleCurrent, updatedAt: new Date('2026-01-01T12:00:05Z') },
  forecast: { status: 'ready', data: sampleForecast, updatedAt: new Date('2026-01-01T12:00:05Z') },
};

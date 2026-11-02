import { describe, expect, it } from 'vitest';
import type { Coordinates, Place, SelectedLocation } from '../../src/core/domain';
import type { FavoritesWriter } from '../../src/core/favorites/api';
import { sampleCoords, samplePlace } from '../fixtures/domain';

// Compile-time guard (DR-03, NFR-005): the favorites API takes a Place only. The typecheck fails if any of the
// expected-error lines below stops being an error, i.e. if device coordinates ever become acceptable.
describe('favorites API accepts a Place only', () => {
  const saved: Place[] = [];
  const favorites: FavoritesWriter = { add: (place) => void saved.push(place) };

  it('accepts a named place', () => {
    favorites.add(samplePlace);
    expect(saved).toEqual([samplePlace]);
  });

  it('rejects device coordinates and device locations at compile time', () => {
    const coords: Coordinates = sampleCoords;
    const device: SelectedLocation = { kind: 'device', deviceCoords: sampleCoords };
    const attempts = [
      // @ts-expect-error raw coordinates are not a Place
      () => favorites.add(coords),
      // @ts-expect-error a SelectedLocation (which may hold device coordinates) is not a Place
      () => favorites.add(device),
      // @ts-expect-error a bare { lat, lon } literal is not a Place
      () => favorites.add({ lat: 1, lon: 2 }),
    ];
    // Never invoked: the assertion is the type error above. Runtime check only that the guards exist.
    expect(attempts).toHaveLength(3);
  });
});

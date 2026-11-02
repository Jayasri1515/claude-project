/**
 * Type-level guard for DR-03 / NFR-005 (impl-plan T-13): the favorites API accepts a `Place` and nothing else, so device
 * coordinates cannot be passed to it without a compile error. Only the minimum needed for that guard is defined here.
 * The behaviour (identity rule, cap, persistence, session-only fallback) is the Favorites Service, task T-22, which
 * replaces the legacy `FavoritesService` and should implement this interface.
 */
import type { Place } from '../domain';

export interface FavoritesWriter {
  /** Saves a named place. Takes a `Place` only; there is deliberately no overload for coordinates or a device location. */
  add(place: Place): void;
}

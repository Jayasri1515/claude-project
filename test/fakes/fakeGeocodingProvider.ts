import type { Coordinates, Place } from '../../src/core/domain';
import { aborted, notFound } from '../../src/core/errors';
import type { AppError } from '../../src/core/errors';
import type { GeocodingProvider } from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import type { Result } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

export type PlaceSearchResult = Result<Place[], AppError>;
export type PlaceReverseResult = Result<Place, AppError>;

export interface FakeGeocodingOptions {
  /** Provide the optional `reverse` method. Default false (baseline option (a): no reverse geocoder). */
  readonly withReverse?: boolean;
}

/**
 * Controllable approved GeocodingProvider. Default: search finds nothing. A call whose signal aborts settles with
 * `err(aborted())`.
 */
export class FakeGeocodingProvider implements GeocodingProvider {
  readonly searchScript = new ScriptedMethod<[string, number], PlaceSearchResult>(ok([]), () => err(aborted()));
  readonly reverseScript: ScriptedMethod<[Coordinates], PlaceReverseResult> | undefined;
  reverse?: (coords: Coordinates, signal: AbortSignal) => Promise<PlaceReverseResult>;

  constructor(options: FakeGeocodingOptions = {}) {
    if (options.withReverse === true) {
      const script = new ScriptedMethod<[Coordinates], PlaceReverseResult>(
        (): PlaceReverseResult => err(notFound()),
        () => err(aborted()),
      );
      this.reverseScript = script;
      this.reverse = (coords, signal) => script.invoke([coords], signal);
    }
  }

  search(text: string, limit: number, signal: AbortSignal): Promise<PlaceSearchResult> {
    return this.searchScript.invoke([text, limit], signal);
  }
}

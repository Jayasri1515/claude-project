import type { Location } from '../../src/core/domain';
import type { AppError } from '../../src/core/errors';
import type { GeocodingProvider } from '../../src/core/ports';
import { ok } from '../../src/core/result';
import type { Result } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

type SearchResult = Result<Location[], AppError>;
type ReverseResult = Result<Location, AppError>;

export interface FakeGeocodingOptions {
  /** Provide the optional `reverse` method. Default false. */
  readonly withReverse?: boolean;
}

/** Controllable GeocodingProvider. Default: search finds nothing. */
export class FakeGeocodingProvider implements GeocodingProvider {
  readonly searchScript = new ScriptedMethod<[string, number], SearchResult>(ok([]));
  readonly reverseScript: ScriptedMethod<[number, number], ReverseResult> | undefined;
  reverse?: (lat: number, lon: number, signal?: AbortSignal) => Promise<ReverseResult>;

  constructor(options: FakeGeocodingOptions = {}) {
    if (options.withReverse === true) {
      const script = new ScriptedMethod<[number, number], ReverseResult>(
        (): ReverseResult => ({ ok: false, error: { code: 'NOT_FOUND', messageKey: 'error.notFound' } }),
      );
      this.reverseScript = script;
      this.reverse = (lat, lon, signal) => script.invoke([lat, lon], signal);
    }
  }

  search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult> {
    return this.searchScript.invoke([query, limit], signal);
  }
}

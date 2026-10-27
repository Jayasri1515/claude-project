/**
 * Search Service (C4, architecture 4.4; FR-001 to FR-007, EC-001 to EC-004).
 *
 * Validates input, calls GeocodingProvider.search, and applies the
 * AmbiguityPolicy (ODD-1). The query is passed to the provider exactly as the
 * user entered it apart from trimming: no "City, Country" parsing.
 */
import type { Aborted } from './aborted';
import { ABORTED } from './aborted';
import type { Config } from './config';
import type { Location } from './domain';
import { emptyInput, inputTooLong, notFound, serviceUnavailable } from './errors';
import type { AppError } from './errors';
import type { GeocodingProvider } from './ports';
import { err, ok } from './result';
import type { Err, Ok, Result } from './result';

export type SearchOutcome =
  /** Exactly one match: select it without asking. */
  | { readonly kind: 'selected'; readonly location: Location }
  /** Several matches (at most the configured limit): the user chooses. */
  | { readonly kind: 'choose'; readonly candidates: readonly Location[] };

/** Ok, a typed failure, or Aborted when the caller's signal fired first (discard silently). */
export type SearchResult = Ok<SearchOutcome> | Err<AppError> | Aborted;

/** ODD-1 seam. Receives one or more candidates, already limited. */
export type AmbiguityPolicy = (candidates: readonly Location[]) => SearchOutcome;

/** Default policy: one match is auto-selected, several are offered for choice. */
export const defaultAmbiguityPolicy: AmbiguityPolicy = (candidates) => {
  const [first] = candidates;
  if (candidates.length === 1 && first !== undefined) return { kind: 'selected', location: first };
  return { kind: 'choose', candidates };
};

export interface SearchServiceDeps {
  readonly geocoding: GeocodingProvider;
  readonly config: Pick<Config, 'maxInputLength' | 'searchResultLimit'>;
  readonly ambiguityPolicy?: AmbiguityPolicy;
}

export class SearchService {
  private readonly geocoding: GeocodingProvider;
  private readonly config: Pick<Config, 'maxInputLength' | 'searchResultLimit'>;
  private readonly policy: AmbiguityPolicy;

  constructor(deps: SearchServiceDeps) {
    this.geocoding = deps.geocoding;
    this.config = deps.config;
    this.policy = deps.ambiguityPolicy ?? defaultAmbiguityPolicy;
  }

  /**
   * Search for a city. Never throws. Empty, whitespace-only or over-long input
   * is rejected before any port call. Over-long input returns INPUT_TOO_LONG
   * (user-approved amendment 2026-10-27, change request C2; earlier it was
   * NOT_FOUND because the error model had no such code).
   */
  async search(rawQuery: string, signal?: AbortSignal): Promise<SearchResult> {
    const wasAborted = (): boolean => signal?.aborted === true;
    const query = rawQuery.trim();
    if (query === '') return err(emptyInput());
    if (Array.from(query).length > this.config.maxInputLength) return err(inputTooLong());
    if (wasAborted()) return ABORTED;

    let result: Result<Location[], AppError>;
    try {
      result = await this.geocoding.search(query, this.config.searchResultLimit, signal);
    } catch {
      // A port that throws violates its contract; treat it as a service failure.
      if (wasAborted()) return ABORTED;
      return err(serviceUnavailable());
    }
    if (wasAborted()) return ABORTED;

    // Every provider failure maps to SERVICE_UNAVAILABLE (ODD-4: NETWORK is treated the same).
    if (!result.ok) return err(serviceUnavailable());

    const candidates = result.value.slice(0, this.config.searchResultLimit);
    if (candidates.length === 0) return err(notFound());
    return ok(this.policy(candidates));
  }
}

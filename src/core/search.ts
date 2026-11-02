/**
 * Search Service (C4, architecture 4.4; FR-001 to FR-007, EC-001 to EC-004).
 *
 * Validates input, calls LegacyGeocodingProvider.search, and applies the
 * AmbiguityPolicy (ODD-1). Input handling follows architecture Section 8 Q5 (A-Q5): the text is trimmed and
 * its internal whitespace collapsed; for "City, Country" or "City, State" only the part before the first comma
 * goes to the provider, and the rest (the qualifier) filters the candidates by region or country, compared
 * case-insensitively. Nothing else about the city name is changed (no case or diacritic matching of its own).
 */
import type { Aborted } from './aborted';
import { ABORTED } from './aborted';
import type { Config } from './config';
import type { Location } from './domain';
import {
  emptyInput,
  inputTooLong,
  invalidResponse,
  networkError,
  notFound,
  rateLimited,
  serviceUnavailable,
} from './errors';
import type { AppError } from './errors';
import type { LegacyGeocodingProvider } from './ports';
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

/** `qualifiedSearchFetchLimit` is optional so a hand-built config without it still works (it then falls back to `searchResultLimit`). */
export type SearchConfig = Pick<Config, 'maxInputLength' | 'searchResultLimit'> &
  Partial<Pick<Config, 'qualifiedSearchFetchLimit'>>;

/** Trim and collapse every run of whitespace to one space (A-Q5). */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

export interface ParsedQuery {
  /** The city name sent to the provider: the part before the first comma. */
  readonly name: string;
  /** The parts after the first comma, lower-cased and split at further commas; empty when there is none. */
  readonly qualifiers: readonly string[];
}

/**
 * Split normalized input at the FIRST comma (A-Q5). The rest is the qualifier; it may itself hold commas
 * ("Paris, Texas, USA"), and each non-empty comma-separated part is one qualifier term.
 */
export function parseQuery(rawQuery: string): ParsedQuery {
  const normalized = normalizeWhitespace(rawQuery);
  const comma = normalized.indexOf(',');
  if (comma < 0) return { name: normalized, qualifiers: [] };
  const qualifiers = normalized
    .slice(comma + 1)
    .split(',')
    .map((part) => normalizeWhitespace(part).toLowerCase())
    .filter((part) => part !== '');
  return { name: normalizeWhitespace(normalized.slice(0, comma)), qualifiers };
}

/** True when every qualifier term equals the candidate's region or country, case-insensitively (A-Q5). */
export function matchesQualifiers(candidate: Location, qualifiers: readonly string[]): boolean {
  const fields = [candidate.admin1, candidate.country]
    .filter((field): field is string => field !== undefined)
    .map((field) => normalizeWhitespace(field).toLowerCase());
  return qualifiers.every((term) => fields.includes(term));
}

export interface SearchServiceDeps {
  readonly geocoding: LegacyGeocodingProvider;
  readonly config: SearchConfig;
  readonly ambiguityPolicy?: AmbiguityPolicy;
}

export class SearchService {
  private readonly geocoding: LegacyGeocodingProvider;
  private readonly config: SearchConfig;
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
    const typed = rawQuery.trim();
    if (typed === '') return err(emptyInput());
    // The cap applies to what the user typed (trimmed), before whitespace is collapsed.
    if (Array.from(typed).length > this.config.maxInputLength) return err(inputTooLong());
    const { name: query, qualifiers } = parseQuery(typed);
    if (query === '') return err(emptyInput()); // only a qualifier was typed, e.g. ", France"
    if (wasAborted()) return ABORTED;
    // A qualifier filters the provider's list, so more candidates are asked for than will be shown.
    const fetchLimit =
      qualifiers.length > 0
        ? Math.max(this.config.searchResultLimit, this.config.qualifiedSearchFetchLimit ?? 0)
        : this.config.searchResultLimit;

    let result: Result<Location[], AppError>;
    try {
      result = await this.geocoding.search(query, fetchLimit, signal);
    } catch {
      // A port that throws violates its contract; treat it as a service failure.
      if (wasAborted()) return ABORTED;
      return err(serviceUnavailable());
    }
    if (wasAborted()) return ABORTED;

    if (!result.ok) {
      // A provider that reports the app's own cancellation is never shown (DR-09), whether or not the signal is seen.
      if (result.error.kind === 'aborted') return ABORTED;
      // A rate-limited answer keeps its own "try again later" outcome (architecture 5.4, M-05).
      if (result.error.kind === 'rate_limited') return err(rateLimited());
      // Network (M-04) and an unreadable response (M-06) keep their own outcome; every other provider failure,
      // including a provider timeout, maps to the service outcome (M-03).
      if (result.error.kind === 'network') return err(networkError());
      if (result.error.kind === 'invalid_response') return err(invalidResponse());
      return err(serviceUnavailable());
    }

    const matching = qualifiers.length > 0 ? result.value.filter((c) => matchesQualifiers(c, qualifiers)) : result.value;
    const candidates = matching.slice(0, this.config.searchResultLimit);
    if (candidates.length === 0) return err(notFound());
    return ok(this.policy(candidates));
  }
}

/**
 * Shared HTTP helper for the Open-Meteo adapters (TASK-022, TASK-023).
 *
 * One GET request, parsed as JSON, under an optional timeout and the caller's
 * AbortSignal. It never throws and returns a Result with an AppError built from
 * the fixed error model only: no response body, status text, URL or exception
 * text is carried into the error (NFR-006). Nothing is logged.
 *
 * Request shape: a plain GET with no custom headers, so a browser sends a CORS
 * "simple" request and needs no preflight. Credentials are never sent, and `referrerPolicy: 'no-referrer'` keeps the
 * page address out of the Referer header.
 *
 * Failure mapping:
 * - fetch rejects (offline, DNS, blocked): NETWORK
 * - HTTP status outside 200-299 (400 error bodies, 429 rate limit, 5xx): SERVICE_UNAVAILABLE
 * - body is not valid JSON: SERVICE_UNAVAILABLE
 * - timeout (when `timeoutMs` is set): TIMEOUT
 * - the caller aborts: SERVICE_UNAVAILABLE. The caller asked for the abort and
 *   discards the outcome (the Search and Weather services check their own
 *   signal), so this value is never shown.
 * There is no automatic retry (architecture ODD-4).
 */
import { networkError, serviceUnavailable, timeoutError } from '../../core/errors';
import type { AppError } from '../../core/errors';
import { err, ok } from '../../core/result';
import type { Result } from '../../core/result';

/** The part of `fetch` the adapters use. Injectable so tests never touch the network. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenMeteoOptions {
  /** Defaults to the global `fetch`. */
  readonly fetch?: FetchLike;
  /** Request timeout in ms. Undefined means no timeout in the adapter. */
  readonly timeoutMs?: number;
}

type Outcome =
  | { readonly kind: 'ok'; readonly value: unknown }
  | { readonly kind: 'http' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'network' }
  | { readonly kind: 'aborted' };

/** Looks up the global fetch at call time, so a test or the browser can replace it. */
export const defaultFetch: FetchLike = (url, init) => globalThis.fetch(url, init);

export async function getJson(
  url: string,
  options: { readonly fetch: FetchLike; readonly timeoutMs?: number | undefined; readonly signal?: AbortSignal | undefined },
): Promise<Result<unknown, AppError>> {
  const { signal, timeoutMs } = options;
  if (signal?.aborted === true) return err(serviceUnavailable());

  const own = new AbortController();
  let timedOut = false;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          own.abort();
        }, timeoutMs);
  const onCallerAbort = (): void => own.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });

  // Settles on abort even if the fetch implementation ignores the signal.
  const abortedOutcome = new Promise<Outcome>((resolve) => {
    own.signal.addEventListener('abort', () => resolve({ kind: 'aborted' }), { once: true });
  });

  const work = (async (): Promise<Outcome> => {
    let response: Response;
    try {
      // No `headers` on purpose (a custom header would trigger a CORS preflight). `referrerPolicy` is a request
      // option, not a header the page adds: it only stops the browser sending this page's address as Referer.
      response = await options.fetch(url, {
        method: 'GET',
        signal: own.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      return own.signal.aborted ? { kind: 'aborted' } : { kind: 'network' };
    }
    if (!response.ok) return { kind: 'http' };
    try {
      return { kind: 'ok', value: (await response.json()) as unknown };
    } catch {
      return own.signal.aborted ? { kind: 'aborted' } : { kind: 'malformed' };
    }
  })();

  try {
    const outcome = await Promise.race([work, abortedOutcome]);
    switch (outcome.kind) {
      case 'ok':
        return ok(outcome.value);
      case 'network':
        return err(networkError());
      case 'aborted':
        return err(timedOut ? timeoutError() : serviceUnavailable());
      case 'http':
      case 'malformed':
      default:
        return err(serviceUnavailable());
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

/** True for a plain JSON object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite number, or undefined for anything else (null, string, NaN, Infinity, missing). */
export function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A non-empty trimmed string, or undefined. */
export function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

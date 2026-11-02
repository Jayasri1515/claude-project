import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchLike } from '../../src/adapters/openMeteo/http';

/** Recorded real responses (see test/fixtures/openmeteo/manifest.json for the capture date). */
export function fixtureText(name: string): string {
  return readFileSync(join(process.cwd(), 'test', 'fixtures', 'openmeteo', name), 'utf8');
}

export function fixtureJson(name: string): Record<string, unknown> {
  return JSON.parse(fixtureText(name)) as Record<string, unknown>;
}

export interface RecordedCall {
  readonly url: string;
  readonly init: RequestInit;
}

/** A fetch replacement that records every call and answers with `respond`. Never touches the network. */
export function stubFetch(respond: (call: RecordedCall) => Response | Promise<Response>): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return { fetch, calls };
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const fixtureResponse = (name: string, status = 200): Response => jsonResponse(fixtureText(name), status);

/** A fetch promise that never settles and ignores the signal (a misbehaving implementation). */
export const neverSettles = (): Promise<Response> => new Promise<Response>(() => undefined);

/** A fetch promise that rejects with an AbortError when the signal aborts, like the real fetch. */
export function abortableHang(init: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
}

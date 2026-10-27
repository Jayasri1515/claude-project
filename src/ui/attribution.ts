/**
 * Data-source credit links (TASK-025). These are the ONLY external web addresses the UI links to; they are
 * navigation links the user can follow, never addresses the app requests. Allow-listed by exact host in
 * `test/security/sourceScan.test.ts` (open-meteo.com, www.geonames.org, creativecommons.org); the two API hosts the
 * app does call are in `src/adapters/openMeteo` and are a separate list.
 *
 * What the official pages say (read 2026-10-27, see impl-plan TASK-025):
 * - https://open-meteo.com/en/licence: API data are CC BY 4.0; "You must include a link next to any location
 *   Open-Meteo data are displayed", sample `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>`;
 *   CC BY also asks for appropriate credit, a link to the licence, and a note if changes were made;
 *   "Location database from GeoNames (CC-BY Licence)".
 * - https://open-meteo.com/en/docs/geocoding-api, section Attribution: "Location data based on GeoNames".
 */
export const ATTRIBUTION_URLS = {
  openMeteo: 'https://open-meteo.com/',
  geonames: 'https://www.geonames.org/',
  ccBy4: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

/** The notices file shipped next to index.html (public/THIRD_PARTY_NOTICES.txt). Relative, so it works under any path. */
export const THIRD_PARTY_NOTICES_PATH = 'THIRD_PARTY_NOTICES.txt';

export interface AttributionLink {
  /** The exact words in the credit text that become the link. */
  readonly phrase: string;
  readonly href: string;
}

export type AttributionSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

/**
 * Splits the credit text into plain and linked parts. The concatenated text of the segments is always exactly
 * `text`: a phrase that is not found (or overlaps an earlier link) is simply not linked, and nothing is added,
 * dropped or reordered. Each phrase links at its first occurrence.
 */
export function splitAttribution(text: string, links: readonly AttributionLink[]): AttributionSegment[] {
  const found: Array<{ start: number; end: number; link: AttributionLink }> = [];
  for (const link of links) {
    if (link.phrase === '') continue;
    const start = text.indexOf(link.phrase);
    if (start < 0) continue;
    const end = start + link.phrase.length;
    if (found.some((other) => start < other.end && end > other.start)) continue;
    found.push({ start, end, link });
  }
  found.sort((a, b) => a.start - b.start);

  const segments: AttributionSegment[] = [];
  let cursor = 0;
  for (const { start, end, link } of found) {
    if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) });
    segments.push({ kind: 'link', text: link.phrase, href: link.href });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

// The Vite `base` (the path the built site is served under). Used by vite.config.ts; tested by test/security/baseUrl.test.ts.
//
// Hosting is undecided beyond "any static HTTPS host; the origin stays configurable" (impl-plan T-06), so the base
// path is configuration, not an assumption about one host. The default is "/" (a host at the root of a domain);
// set VITE_BASE for a host that serves the site under a sub-path, for example VITE_BASE=/weather/.
// The default value "/" is an Implementer choice that the user has not confirmed (impl-plan Section 6, item 8).

/** Base used when VITE_BASE is not set. */
export const DEFAULT_BASE = '/';

/** A base is "/" or "/segment/" (more segments allowed); letters, digits and . _ ~ - only. */
const VALID_BASE = /^\/(?:[A-Za-z0-9._~-]+\/)*$/;

/**
 * @param {{ env: Record<string, string | undefined> }} input
 *   `env` is the merged process and .env* values (only VITE_BASE is read).
 * @returns {string} A base with a leading and a trailing slash.
 * @throws when VITE_BASE is set but is not a plain absolute path such as "/" or "/weather/".
 */
export function resolveBase({ env }) {
  const requested = env.VITE_BASE;
  if (requested !== undefined && requested.trim() !== '') {
    const trimmed = requested.trim();
    const withSlashes = `/${trimmed.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
    const segments = withSlashes.split('/').filter((s) => s !== '');
    if (!VALID_BASE.test(withSlashes) || trimmed.includes('//') || segments.some((s) => s === '.' || s === '..')) {
      throw new Error(
        `VITE_BASE="${requested}" is not usable. Use "/" or a plain path such as "/weather/" ` +
          '(letters, digits and . _ ~ - only, no "." or ".." segments, no host).',
      );
    }
    return withSlashes;
  }
  return DEFAULT_BASE;
}

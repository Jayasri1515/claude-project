// The Vite `base` (the path the built site is served under). Used by vite.config.ts; tested by test/security/baseUrl.test.ts.
//
// The expected host is a GitHub Pages PROJECT site for the repository Jayasri1515/claude-project, which is served
// under a sub-path: https://jayasri1515.github.io/claude-project/ (expected URL, unverified, nothing is published).
// So release builds use '/claude-project/'. The dev server and demo mode use '/'. VITE_BASE overrides everything,
// for example VITE_BASE=/ for a host at the root of a domain.

/** Base of the GitHub Pages project site. */
export const PROJECT_BASE = '/claude-project/';

/** A base is "/" or "/segment/" (more segments allowed); letters, digits and . _ ~ - only. */
const VALID_BASE = /^\/(?:[A-Za-z0-9._~-]+\/)*$/;

/**
 * @param {{ command: string, mode: string, env: Record<string, string | undefined> }} input
 *   `command` is Vite's 'serve' or 'build'; `env` is the merged process and .env* values (only VITE_BASE is read).
 * @returns {string} A base with a leading and a trailing slash.
 * @throws when VITE_BASE is set but is not a plain absolute path such as "/" or "/claude-project/".
 */
export function resolveBase({ command, mode, env }) {
  const requested = env.VITE_BASE;
  if (requested !== undefined && requested.trim() !== '') {
    const trimmed = requested.trim();
    const withSlashes = `/${trimmed.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
    const segments = withSlashes.split('/').filter((s) => s !== '');
    if (!VALID_BASE.test(withSlashes) || trimmed.includes('//') || segments.some((s) => s === '.' || s === '..')) {
      throw new Error(
        `VITE_BASE="${requested}" is not usable. Use "/" or a plain path such as "/claude-project/" ` +
          '(letters, digits and . _ ~ - only, no "." or ".." segments, no host).',
      );
    }
    return withSlashes;
  }
  // The dev server and test runs ('serve' in any mode but production) and demo builds are served from the root.
  // `vite preview` is 'serve' + 'production': it must use the same base as the build it serves.
  if (mode === 'demo') return '/';
  if (command === 'serve' && mode !== 'production') return '/';
  return PROJECT_BASE;
}

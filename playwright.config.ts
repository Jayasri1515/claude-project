import { defineConfig } from '@playwright/test';

/**
 * Real-browser checks (TASK-039, TASK-040, TASK-041, TASK-043). Run with `npm run test:browser`.
 * They use the browsers already installed on the machine (Microsoft Edge and Google
 * Chrome, via the `channel` option), so nothing is downloaded. Firefox and Safari are
 * NOT covered: Playwright cannot drive the system copies of those, and none is installed
 * here.
 *
 * Two servers are started:
 * - the DEMO dev server (invented data) on port 4173 for the edge/chrome projects (every spec but release.spec.ts);
 * - `vite preview` of the plain RELEASE build on port 4174, served under /claude-project/, for the release-edge/release-chrome projects
 *   (e2e/release.spec.ts). Its command runs `npm run build:release` first (type check, production build, then
 *   scan:dist), so that project tests exactly what the documented release path produces. It overwrites dist/.
 * `npm run test:browser:release` runs only the release projects.
 */
const DEMO_PORT = 4173;
const RELEASE_PORT = 4174;
// Release builds are made for the GitHub Pages project site path (scripts/baseUrl.mjs), and `vite preview` serves them
// under it, so the release projects open the app at this path. (Nothing is published: this is a local server only.)
const RELEASE_BASE_PATH = '/claude-project/';
const RELEASE_URL = `http://localhost:${RELEASE_PORT}${RELEASE_BASE_PATH}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: { trace: 'off' },
  webServer: [
    {
      command: `npx vite --mode demo --port ${DEMO_PORT} --strictPort`,
      url: `http://localhost:${DEMO_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run build:release && npx vite preview --port ${RELEASE_PORT} --strictPort`,
      url: RELEASE_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    { name: 'edge', testIgnore: 'release.spec.ts', use: { channel: 'msedge', baseURL: `http://localhost:${DEMO_PORT}` } },
    { name: 'chrome', testIgnore: 'release.spec.ts', use: { channel: 'chrome', baseURL: `http://localhost:${DEMO_PORT}` } },
    { name: 'release-edge', testMatch: 'release.spec.ts', use: { channel: 'msedge', baseURL: RELEASE_URL } },
    { name: 'release-chrome', testMatch: 'release.spec.ts', use: { channel: 'chrome', baseURL: RELEASE_URL } },
  ],
});

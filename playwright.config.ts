import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser checks. Run with `npm run test:browser`.
 * Engines (architecture 7.0): Chromium, Firefox and WebKit, on a desktop viewport and as emulated mobile devices
 * (a Chromium-based phone and a WebKit-based phone). They are the browsers Playwright downloads itself
 * (`npx playwright install chromium firefox webkit`); the machine's Edge, Chrome and Safari are NOT driven here, and
 * real iOS, Android, Edge and Safari checks are manual (impl-plan T-70).
 *
 * Server started: `vite preview` of the RELEASE build on port 4174, served under RELEASE_BASE_PATH, for the release-*
 * projects (e2e/release.spec.ts). Its command runs `npm run build:release` first (type check, production build, then
 * scan:dist), so that project tests exactly what the documented release path produces. It overwrites dist/.
 * `npm run test:browser:release` runs the same projects.
 *
 * Specs (all against the release build, Open-Meteo intercepted, shared helpers in e2e/support.ts):
 * release.spec.ts (build, requests, privacy, credits), accessibility.spec.ts (axe in every main state, T-62),
 * layout.spec.ts (breakpoints, scroll, targets, T-63) and browserApis.spec.ts (geolocation and localStorage cases,
 * T-61). The feature specs that depended on the invented-data dev server were removed by impl-plan T-14.
 */
const RELEASE_PORT = 4174;
// The release build is made for a non-root base on purpose, so the spec proves that every asset and link follows the
// configured base (VITE_BASE, scripts/baseUrl.mjs). The default of the app itself is "/". This path is test-only.
// Override with E2E_BASE_PATH if needed.
const RELEASE_BASE_PATH = process.env.E2E_BASE_PATH ?? '/weather-e2e/';
const RELEASE_URL = `http://localhost:${RELEASE_PORT}${RELEASE_BASE_PATH}`;

/** The engine/device matrix. */
const ENGINES = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] },
  { name: 'mobile-chromium', use: devices['Pixel 7'] },
  { name: 'mobile-webkit', use: devices['iPhone 14'] },
] as const;

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
      command: `npm run build:release && npx vite preview --port ${RELEASE_PORT} --strictPort`,
      url: RELEASE_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_BASE: RELEASE_BASE_PATH },
    },
  ],
  projects: ENGINES.map(({ name, use }) => ({
    name: `release-${name}`,
    testMatch: ['release.spec.ts', 'accessibility.spec.ts', 'layout.spec.ts', 'browserApis.spec.ts'],
    use: { ...use, baseURL: RELEASE_URL },
  })),
});

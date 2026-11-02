import { defineConfig } from 'vitest/config';

/**
 * Manual live smoke check (npm run smoke:live). Separate from the default test suite on purpose: it makes a
 * few REAL requests to the Open-Meteo APIs, so `npm test` (vite.config.ts, which only includes *.test.ts) never
 * runs it and the default suite never touches the network.
 */
export default defineConfig({
  test: {
    include: ['test/live/**/*.live.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});

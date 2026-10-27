import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolveBase } from './scripts/baseUrl.mjs';
import { assertReleaseBuildAllowed } from './scripts/releaseGuard.mjs';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Fails a non-demo build when VITE_USE_DEMO=true is set (process environment or .env files).
  assertReleaseBuildAllowed({ command, mode, env });
  return {
    // '/claude-project/' for release builds and `vite preview` (GitHub Pages project site), '/' for dev and demo;
    // VITE_BASE overrides. Asset URLs in index.html and the bundle follow it.
    base: resolveBase({ command, mode, env }),
    plugins: [react()],
    build: { outDir: 'dist' },
    test: {
      include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'node',
    },
  };
});

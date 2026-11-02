import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolveBase } from './scripts/baseUrl.mjs';
import { buildCsp } from './scripts/csp.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // '/' by default; VITE_BASE sets the path the site is served under (scripts/baseUrl.mjs). Asset URLs in
    // index.html and the bundle follow it.
    base: resolveBase({ env }),
    plugins: [
      react(),
      {
        // The release CSP (scripts/csp.mjs, impl-plan T-51) is added to dist/index.html on build only: the dev server
        // needs inline script for hot reload, which the policy forbids. scan:dist checks the built file.
        name: 'release-csp',
        apply: 'build',
        transformIndexHtml: () => [
          { tag: 'meta', injectTo: 'head-prepend', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() } },
        ],
      },
    ],
    build: { outDir: 'dist' },
    test: {
      include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'node',
    },
  };
});

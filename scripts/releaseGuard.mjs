// Guard for release builds (TASK-043). A plain `vite build` (any mode other than "demo") must not be
// made with demo mode requested, otherwise the demo layer would be bundled into something that is
// meant to be deployed. `npm run build:demo` (Vite mode "demo") is the only build allowed to include it.
// Used by vite.config.ts and checked by test/security/releaseGuard.test.ts.

/**
 * Throws when a release build would include the demo layer.
 * @param {{ command: string, mode: string, env: Record<string, string | undefined> }} input
 *   `env` is the merged process and .env* values for the build (only VITE_USE_DEMO is read).
 */
export function assertReleaseBuildAllowed({ command, mode, env }) {
  if (command !== 'build' || mode === 'demo') return;
  if (env.VITE_USE_DEMO === 'true') {
    throw new Error(
      'Refusing to build: VITE_USE_DEMO=true is set, which would put the invented-data demo code into a ' +
        'non-demo build. Unset VITE_USE_DEMO for a release build (npm run build:release), or use ' +
        '"npm run build:demo" for a demo build that must never be deployed.',
    );
  }
}

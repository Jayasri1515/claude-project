// Entry point. Builds the app through the composition root. A normal build and `npm run dev` use the
// real Open-Meteo adapters (composeLive, TASK-037). Demo mode (invented data) is opt-in only:
// `npm run dev:demo` (Vite mode "demo") or the build flag VITE_USE_DEMO=true. See src/composition.ts.
//
// Release builds exclude the demo code: the demo composition is loaded with a dynamic
// import behind a build-time constant (Vite replaces import.meta.env.* statically), so
// in a plain `npm run build` the branch is dead and the bundler drops the whole src/dev
// layer. `npm run scan:dist` fails if demo markers end up in a release bundle.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { composeLive } from './composition';
import type { Composition } from './composition';
import './styles.css';
import { App } from './ui/App';

// Demo is requested only by the Vite mode "demo" (npm run dev:demo / build:demo) or the build flag
// VITE_USE_DEMO=true. Nothing else, in particular not a production build by itself, turns it on.
// Keep both reads written out in full, directly in the condition: Vite replaces
// import.meta.env.MODE and import.meta.env.VITE_USE_DEMO with literals only in that form, which
// is what lets the bundler remove the dynamic import below from release builds.
async function createComposition(): Promise<Composition> {
  if (import.meta.env.MODE === 'demo' || import.meta.env.VITE_USE_DEMO === 'true') {
    const { composeDemo } = await import('./dev/demoComposition');
    return composeDemo();
  }
  return composeLive();
}

const container = document.getElementById('root');
if (container) {
  void createComposition().then(({ store, controller, config, demo, unconfigured }) => {
    createRoot(container).render(
      <StrictMode>
        <App store={store} controller={controller} config={config} demo={demo} unconfigured={unconfigured} />
      </StrictMode>,
    );
    // Nothing to start when no data source is configured (composeLive always configures one).
    if (!unconfigured) void controller.start();
  });
}

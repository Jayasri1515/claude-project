// Entry point. Builds the app through the composition root (src/composition.ts) with the real Open-Meteo
// adapters (composeLive). There is no alternative data source in the bundle.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { composeLive } from './composition';
import './styles.css';
import { App } from './ui/App';

const container = document.getElementById('root');
if (container) {
  const { store, controller, config, unconfigured } = composeLive();
  createRoot(container).render(
    <StrictMode>
      <App store={store} controller={controller} config={config} unconfigured={unconfigured} />
    </StrictMode>,
  );
  // Nothing to start when no data source is configured (composeLive always configures one).
  if (!unconfigured) void controller.start();
}

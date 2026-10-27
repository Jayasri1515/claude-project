/**
 * App shell, layout and navigation (TASK-026; FR-040, FR-043, FR-045, NFR-002,
 * NFR-003, NFR-007, AC-007-1, AC-007-4, AC-007-6).
 *
 * One consistent model: a banner, a navigation landmark whose links jump to the
 * four sections (search, current weather, forecast, favorites), and a main
 * landmark holding those sections in one order at every width. Only the column
 * arrangement changes with the layout tier (mobile-first, single column
 * first). The UI renders store state and sends intents; it holds no business
 * logic and never calls an adapter.
 *
 * The navigation links point at each section's heading, which is focusable
 * (tabIndex -1), so following a link moves keyboard and screen reader focus to
 * the section, not just the scroll position.
 */
import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Config } from '../core/config';
import { message } from '../core/messages';
import type { ViewStateStore } from '../core/store';
import { UiContext } from './context';
import type { UiContextValue, UiController } from './context';
import { CurrentWeatherCard } from './CurrentWeatherCard';
import { ErrorBoundary } from './ErrorBoundary';
import { FavoritesPanel } from './FavoritesPanel';
import { Footer } from './Footer';
import { ForecastList } from './ForecastList';
import { LocationControl } from './LocationControl';
import { RefreshBar } from './RefreshBar';
import { SearchPanel } from './SearchPanel';
import { APP_TITLE_ID, SECTION_ORDER, SECTIONS } from './sections';
import { StatusArea } from './StatusArea';
import { UnitToggle } from './UnitToggle';
import { useGuardedAction } from './useGuardedAction';
import { useLayout } from './useLayout';

export interface AppProps {
  readonly store: ViewStateStore;
  readonly controller: UiController;
  readonly config: Config;
  /** True when the data comes from the built-in demo providers (TASK-036). */
  readonly demo?: boolean;
  /** True when no weather data source is configured: a notice replaces the sections. */
  readonly unconfigured?: boolean;
}

function DemoNotice() {
  return (
    <p className="demo-notice" role="note">
      {message('ui.demoNotice')}
    </p>
  );
}

function Shell({ demo, config }: { demo: boolean; config: Config }) {
  const layout = useLayout(config.breakpoints);
  return (
    <div className="app" data-layout={layout}>
      <header className="app-header">
        {demo ? <DemoNotice /> : null}
        <h1 id={APP_TITLE_ID} tabIndex={-1}>
          {message('ui.app.title')}
        </h1>
        <UnitToggle />
      </header>
      <nav aria-label={message('ui.nav.label')}>
        <ul>
          {SECTION_ORDER.map((section) => (
            <li key={section.id}>
              <a href={`#${section.headingId}`}>{message(section.navId)}</a>
            </li>
          ))}
        </ul>
      </nav>
      <StatusArea />
      <main className="app-main">
        <section id={SECTIONS.search.id} className="panel panel-search" aria-labelledby={SECTIONS.search.headingId}>
          <h2 id={SECTIONS.search.headingId} tabIndex={-1}>
            {message(SECTIONS.search.titleId)}
          </h2>
          <SearchPanel />
          <LocationControl />
        </section>
        <section id={SECTIONS.current.id} className="panel panel-current" aria-labelledby={SECTIONS.current.headingId}>
          <h2 id={SECTIONS.current.headingId} tabIndex={-1}>
            {message(SECTIONS.current.titleId)}
          </h2>
          <CurrentWeatherCard />
          <RefreshBar />
        </section>
        <section
          id={SECTIONS.forecast.id}
          className="panel panel-forecast"
          aria-labelledby={SECTIONS.forecast.headingId}
        >
          <h2 id={SECTIONS.forecast.headingId} tabIndex={-1}>
            {message(SECTIONS.forecast.titleId)}
          </h2>
          <ForecastList />
        </section>
        <section
          id={SECTIONS.favorites.id}
          className="panel panel-favorites"
          aria-labelledby={SECTIONS.favorites.headingId}
        >
          <h2 id={SECTIONS.favorites.headingId} tabIndex={-1}>
            {message(SECTIONS.favorites.titleId)}
          </h2>
          <FavoritesPanel />
        </section>
      </main>
      <Footer />
    </div>
  );
}

/** Shown instead of the sections when no weather data source is configured. */
function NotConfigured({ config }: { config: Config }) {
  const layout = useLayout(config.breakpoints);
  return (
    <div className="app" data-layout={layout}>
      <header className="app-header">
        <h1 id={APP_TITLE_ID} tabIndex={-1}>
          {message('ui.app.title')}
        </h1>
      </header>
      <main className="app-main">
        <section className="panel not-configured" aria-labelledby="not-configured-heading">
          <h2 id="not-configured-heading">{message('ui.notConfigured.heading')}</h2>
          <p>{message('ui.notConfigured.body')}</p>
        </section>
      </main>
    </div>
  );
}

interface ProviderProps {
  readonly store: ViewStateStore;
  readonly controller: UiController;
  readonly config: Config;
  readonly demo: boolean;
  readonly children: ReactNode;
}

function UiProvider({ store, controller, config, demo, children }: ProviderProps) {
  const refresh = useGuardedAction(useCallback(() => controller.refresh(), [controller]));
  const value = useMemo<UiContextValue>(
    () => ({ store, controller, config, demo, refresh }),
    [store, controller, config, demo, refresh],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function App({ store, controller, config, demo = false, unconfigured = false }: AppProps) {
  return (
    <ErrorBoundary restoreFocus={() => document.getElementById(APP_TITLE_ID)}>
      {unconfigured ? (
        <NotConfigured config={config} />
      ) : (
        <UiProvider store={store} controller={controller} config={config} demo={demo}>
          <Shell demo={demo} config={config} />
        </UiProvider>
      )}
    </ErrorBoundary>
  );
}

/**
 * Wiring between the UI and the core (architecture 4.1). The UI receives the
 * view-state store (to render) and a controller (to send intents). It never
 * touches services or adapters directly, and holds no business logic.
 */
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { AppController } from '../core/appController';
import type { Config } from '../core/config';
import type { ViewState, ViewStateStore } from '../core/store';
import type { GuardedAction } from './useGuardedAction';

/** The intents the UI may send. A structural subset of AppController, so tests can pass a fake. */
export type UiController = Pick<
  AppController,
  | 'searchCity'
  | 'chooseCandidate'
  | 'useMyLocation'
  | 'refresh'
  | 'selectFavorite'
  | 'addFavorite'
  | 'removeFavorite'
  | 'setTemperatureUnit'
>;

export interface UiContextValue {
  readonly store: ViewStateStore;
  readonly controller: UiController;
  readonly config: Config;
  /** True while the built-in demo providers are in use (TASK-036). */
  readonly demo: boolean;
  /**
   * The one refresh guard shared by every control that refetches (Refresh and
   * both Retry buttons), so a second activation of ANY of them is ignored while
   * one refresh is pending (FR-028, AC-P-03).
   */
  readonly refresh: GuardedAction;
}

export const UiContext = createContext<UiContextValue | undefined>(undefined);

export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (value === undefined) throw new Error('UiContext is missing: render inside <UiContext.Provider>.');
  return value;
}

/** Subscribe to the view-state store. */
export function useViewState(): ViewState {
  const { store } = useUi();
  // Stable identities: an inline arrow would make React resubscribe on every render.
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The shared refresh guard (see UiContextValue.refresh). */
export function useRefreshAction(): GuardedAction {
  return useUi().refresh;
}

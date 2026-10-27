/**
 * App Controller (C2, architecture 4.2; Flows A, B, D).
 *
 * The one place that receives UI intents and coordinates the services. It owns:
 * - the selection token: every intent that may change the selected location
 *   (search, choose a candidate, select a favorite, "Use my location", launch
 *   auto-detect) increments it and aborts all work started under the previous
 *   token. A result whose token no longer matches is dropped with no UI change,
 *   so the latest user intent always wins (F-007);
 * - the LaunchPolicy (ODD-5, F-001): auto-detect at launch only when the
 *   permission is positively 'granted'; otherwise no prompt on first paint;
 * - the rule that a device location can be favorited only through the named
 *   place it resolved to (F-004).
 *
 * Intent methods never reject: an unexpected exception becomes a transient
 * message (NFR-001).
 */
import { isAbortedResult } from './aborted';
import type { Location, TemperatureUnit } from './domain';
import { emptyInput } from './errors';
import type { FavoritesService } from './favorites/favoritesService';
import type { LocationFlow } from './locationFlow';
import type { PermissionState } from './ports';
import type { SearchService } from './search';
import type { SettingsService } from './settings';
import type { ViewStateStore } from './store';
import type { WeatherService } from './weatherService';

/** True when the app should detect the location automatically at launch. */
export type LaunchPolicy = (permission: PermissionState) => boolean;

/** Auto-detect only when the permission is positively granted. */
export const defaultLaunchPolicy: LaunchPolicy = (permission) => permission === 'granted';

export interface AppControllerDeps {
  readonly search: SearchService;
  readonly weather: WeatherService;
  readonly locationFlow: LocationFlow;
  readonly favorites: FavoritesService;
  readonly settings: SettingsService;
  readonly store: ViewStateStore;
  readonly launchPolicy?: LaunchPolicy;
}

interface Ticket {
  readonly token: number;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
}

export class AppController {
  private readonly search_: SearchService;
  private readonly weather: WeatherService;
  private readonly locationFlow: LocationFlow;
  private readonly favorites: FavoritesService;
  private readonly settings: SettingsService;
  private readonly store: ViewStateStore;
  private readonly launchPolicy: LaunchPolicy;

  private token = 0;
  private abortController = new AbortController();
  /** Aborts the locate attempt in flight; it is not a selection until it resolves. */
  private locateAbort: AbortController | undefined;
  /** Token of the selection whose city load is in flight (refresh joins it by being ignored). */
  private loadToken: number | undefined;
  /** Token of the selection whose search is waiting for its answer. */
  private searchToken: number | undefined;

  constructor(deps: AppControllerDeps) {
    this.search_ = deps.search;
    this.weather = deps.weather;
    this.locationFlow = deps.locationFlow;
    this.favorites = deps.favorites;
    this.settings = deps.settings;
    this.store = deps.store;
    this.launchPolicy = deps.launchPolicy ?? defaultLaunchPolicy;
  }

  // ---- Intents -----------------------------------------------------------

  /** App launch: load favorites and settings, then apply the LaunchPolicy. */
  start(): Promise<void> {
    return this.safely(async () => {
      this.syncFavorites();
      this.store.setState({ temperatureUnit: this.settings.getTemperatureUnit() });
      const tokenAtLaunch = this.token;
      const permission = await this.locationFlow.getPermissionState();
      // The user acted while the permission was being read: their intent wins.
      if (this.token !== tokenAtLaunch) return;
      if (this.launchPolicy(permission)) await this.locate(false);
    });
  }

  /** Submit a city search. */
  searchCity(query: string): Promise<void> {
    return this.safely(async () => {
      // Empty input is rejected without disturbing work already under way.
      if (query.trim() === '') {
        this.store.setState({ search: { status: 'error', error: emptyInput() } });
        return;
      }
      const ticket = this.beginSelection();
      this.store.setState({ search: { status: 'loading' } });
      this.searchToken = ticket.token;
      let result: Awaited<ReturnType<SearchService['search']>>;
      try {
        result = await this.search_.search(query, ticket.signal);
      } finally {
        if (this.searchToken === ticket.token) this.searchToken = undefined;
      }
      if (!ticket.isCurrent() || isAbortedResult(result)) return;
      if (!result.ok) {
        this.store.setState({ search: { status: 'error', error: result.error } });
        this.store.settleInterruptedLoading();
        return;
      }
      if (result.value.kind === 'choose') {
        this.store.setState({ search: { status: 'choose', candidates: result.value.candidates } });
        this.store.settleInterruptedLoading();
        return;
      }
      this.store.setState({ search: { status: 'idle' } });
      await this.showLocation(result.value.location, undefined, ticket);
    });
  }

  /** The user picked one of several candidates. */
  chooseCandidate(location: Location): Promise<void> {
    return this.safely(async () => {
      const ticket = this.beginSelection();
      this.store.setState({ search: { status: 'idle' } });
      await this.showLocation(location, undefined, ticket);
    });
  }

  /** The "Use my location" control. The permission state is re-read each time. */
  useMyLocation(): Promise<void> {
    return this.safely(() => this.locate(true));
  }

  /** Re-fetch both sections for the displayed location. */
  refresh(): Promise<void> {
    return this.safely(async () => {
      const snapshot = this.store.getState().snapshot;
      if (snapshot === undefined) return;
      // The initial load of this selection is still running: it already fetches
      // both sections, so a second request is not made (FR-028, AC-P-03).
      if (this.loadToken === this.token) return;
      // Same selection: not a new token, but cancelled if the selection changes.
      const token = this.token;
      const ticket: Ticket = { token, signal: this.abortController.signal, isCurrent: () => this.token === token };
      const result = await this.weather.refresh(snapshot, {
        signal: ticket.signal,
        onUpdate: (next) => {
          if (ticket.isCurrent()) this.store.setSnapshot(next);
        },
      });
      if (!ticket.isCurrent() || isAbortedResult(result)) return;
      this.store.setSnapshot(result.value);
    });
  }

  /** Show a saved favorite using its stored coordinates (no name search). */
  selectFavorite(key: string): Promise<void> {
    return this.safely(async () => {
      const favorite = this.favorites.list().find((f) => f.key === key);
      if (favorite === undefined) return;
      const ticket = this.beginSelection();
      this.store.setState({ search: { status: 'idle' } });
      await this.showLocation(favorite, undefined, ticket);
    });
  }

  /** Add the displayed city to favorites (a device location only via its resolved named place). */
  addFavorite(): Promise<void> {
    return this.safely(async () => {
      const state = this.store.getState();
      const selected = state.selectedLocation;
      if (selected === undefined) {
        this.store.pushMessage('ui.favoriteNothingSelected');
        return;
      }
      const toSave = selected.source === 'device' ? state.resolvedPlace : selected;
      if (toSave === undefined) {
        this.store.pushMessage('ui.favoriteNeedsName');
        return;
      }
      const outcome = this.favorites.add(toSave);
      this.syncFavorites();
      if (outcome === 'duplicate') this.store.pushMessage('ui.favoriteDuplicate');
      else if (outcome === 'limit-reached') this.store.pushMessage('ui.favoriteLimitReached');
      else if (outcome === 'device-location-not-allowed') this.store.pushMessage('ui.favoriteNeedsName');
    });
  }

  /** Remove a favorite. The displayed weather is not cleared. */
  removeFavorite(key: string): Promise<void> {
    return this.safely(async () => {
      this.favorites.remove(key);
      this.syncFavorites();
    });
  }

  setTemperatureUnit(unit: TemperatureUnit): Promise<void> {
    return this.safely(async () => {
      this.settings.setTemperatureUnit(unit);
      this.store.setState({ temperatureUnit: this.settings.getTemperatureUnit() });
      // The choice applies for this session either way; tell the user it will not be remembered.
      if (this.settings.storageUnavailable) this.store.pushMessage('ui.settingsNotSaved');
    });
  }

  // ---- Internals ---------------------------------------------------------

  /** New selection: bump the token and cancel everything started under the old one. */
  private beginSelection(): Ticket {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.locateAbort?.abort();
    this.locateAbort = undefined;
    this.token += 1;
    const token = this.token;
    // Work that was in flight under the old token will be discarded, so its
    // transient "in progress" states must not outlive it.
    const { search, locationFlow } = this.store.getState();
    if (search.status === 'loading') this.store.setState({ search: { status: 'idle' } });
    if (locationFlow.status === 'locating') this.store.setState({ locationFlow: { status: 'idle' } });
    return { token, signal: this.abortController.signal, isCurrent: () => this.token === token };
  }

  /**
   * Find the device location. The outcome is unknown until the platform answers,
   * so a locate attempt does not take over the selection: a city already shown
   * (or loading) stays untouched and keeps its data if the attempt fails or
   * times out. Only a resolved location starts a new selection. Any other
   * selection intent aborts a locate in flight; a second locate replaces the first.
   */
  private async locate(userInitiated: boolean): Promise<void> {
    // A search still waiting for its answer is superseded by this newer intent.
    if (this.searchToken === this.token) {
      this.beginSelection();
      this.store.settleInterruptedLoading();
    }
    this.locateAbort?.abort();
    const locateAbort = new AbortController();
    this.locateAbort = locateAbort;
    const token = this.token;
    const isCurrent = (): boolean => this.token === token && this.locateAbort === locateAbort;

    this.store.setState({ locationFlow: { status: 'locating' } });
    const result = await this.locationFlow.locate(locateAbort.signal, { userInitiated });
    if (!isCurrent() || isAbortedResult(result)) return;
    this.locateAbort = undefined;
    if ('needsUserAction' in result) {
      this.store.setState({ locationFlow: { status: 'idle' } });
      return;
    }
    if (!result.ok) {
      this.store.setState({ locationFlow: { status: 'error', error: result.error } });
      return;
    }
    const ticket = this.beginSelection();
    await this.showLocation(result.value.location, result.value.resolvedPlace, ticket);
  }

  private async showLocation(location: Location, resolvedPlace: Location | undefined, ticket: Ticket): Promise<void> {
    // A successful selection clears earlier location and search errors.
    this.store.setState({
      selectedLocation: location,
      resolvedPlace,
      search: { status: 'idle' },
      locationFlow: { status: 'idle' },
    });
    this.loadToken = ticket.token;
    try {
      const result = await this.weather.load(location, {
        signal: ticket.signal,
        onUpdate: (snapshot) => {
          if (ticket.isCurrent()) this.store.setSnapshot(snapshot);
        },
      });
      if (!ticket.isCurrent() || isAbortedResult(result)) return;
      this.store.setSnapshot(result.value);
    } finally {
      if (this.loadToken === ticket.token) this.loadToken = undefined;
    }
  }

  private syncFavorites(): void {
    this.store.setState({
      favorites: this.favorites.list(),
      favoritesStorageUnavailable: this.favorites.storageUnavailable,
    });
  }

  /** Run an intent so it can never reject. */
  private async safely(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch {
      this.store.settleInterruptedLoading();
      this.store.pushMessage('ui.unexpectedError');
    }
  }
}

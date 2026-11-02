/**
 * App Controller (C2, architecture 4.2; Flows A, B, D).
 *
 * The one place that receives UI intents and coordinates the services. It owns:
 * - the selection token: every intent that may change the selected location
 *   (search, choose a candidate, select a favorite, "Use my location", launch
 *   auto-detect) increments it and aborts all work started under the previous
 *   token. A result whose token no longer matches is dropped with no UI change,
 *   so the latest user intent always wins (F-007);
 * - the launch request for the device location (REQ-WF2-01, REQ-WF2-02, architecture 3.3): the app asks the platform
 *   for the position when it opens, which is what makes the browser show its permission prompt;
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
import type { SearchService } from './search';
import type { SettingsService } from './settings';
import type { ViewStateStore } from './store';
import type { WeatherService } from './weatherService';

export interface AppControllerDeps {
  readonly search: SearchService;
  readonly weather: WeatherService;
  readonly locationFlow: LocationFlow;
  readonly favorites: FavoritesService;
  readonly settings: SettingsService;
  readonly store: ViewStateStore;
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

  private token = 0;
  private abortController = new AbortController();
  /** Aborts the locate attempt in flight; it is not a selection until it resolves. */
  private locateAbort: AbortController | undefined;
  /**
   * The controller-wide single-flight flag (architecture 3.7, A-Q19): the token of the one weather load or refresh
   * that is active, or undefined. At most one is active at any time. A new selection releases it synchronously
   * (after aborting the old request) before its own load takes it; a refresh while it is set is not started.
   */
  private activeLoad: number | undefined;
  /** Token of the selection whose search is waiting for its answer. */
  private searchToken: number | undefined;

  constructor(deps: AppControllerDeps) {
    this.search_ = deps.search;
    this.weather = deps.weather;
    this.locationFlow = deps.locationFlow;
    this.favorites = deps.favorites;
    this.settings = deps.settings;
    this.store = deps.store;
  }

  // ---- Intents -----------------------------------------------------------

  /**
   * App launch: load favorites and settings, then request the device location (REQ-WF2-01, REQ-WF2-02). A search or
   * pick made while the request is open supersedes it (the user's explicit choice wins, architecture 3.3 step 6).
   */
  start(): Promise<void> {
    return this.safely(async () => {
      this.syncFavorites();
      this.store.setState({ temperatureUnit: this.settings.getTemperatureUnit() });
      await this.locate();
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

  /** The "Use my location" control: a new attempt. The permission state is re-read each time. */
  useMyLocation(): Promise<void> {
    return this.safely(() => this.locate());
  }

  /** Re-fetch both sections for the displayed location. */
  refresh(): Promise<void> {
    return this.safely(async () => {
      const { snapshot, selectedLocation } = this.store.getState();
      // The shown city's coordinates come from the selection, which always accompanies a shown view.
      if (snapshot === undefined || selectedLocation === undefined || selectedLocation.key !== snapshot.key) return;
      // A search or pick is waiting for its answer: the snapshot on screen belongs to the previous city and the
      // new selection will load its own weather, so a refresh of the old city must not start (A-Q19, DR-18).
      if (this.searchToken === this.token) return;
      // A load or refresh of this selection is already running: it fetches both sections, so a second request is
      // not made (single-flight, FR-028, AC-P-03).
      if (this.activeLoad === this.token) return;
      // Same selection: not a new token, but cancelled if the selection changes.
      const token = this.token;
      // A result is applied only while the selection is unchanged and still shows the refreshed city (DR-18).
      const shownKey = snapshot.key;
      const isCurrent = (): boolean => {
        const selected = this.store.getState().selectedLocation;
        return this.token === token && (selected === undefined || selected.key === shownKey);
      };
      const ticket: Ticket = { token, signal: this.abortController.signal, isCurrent };
      this.activeLoad = token;
      try {
        const result = await this.weather.refresh(selectedLocation, snapshot, {
          signal: ticket.signal,
          onUpdate: (next) => {
            if (ticket.isCurrent()) this.store.setSnapshot(next);
          },
        });
        if (!ticket.isCurrent() || isAbortedResult(result)) return;
        this.store.setSnapshot(result.value);
      } finally {
        if (this.activeLoad === token) this.activeLoad = undefined;
      }
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
    // The superseded load was just aborted (it will settle as `aborted` and be dropped): release the flag in the same
    // synchronous step, so the new selection's load can take it and two loads never overlap.
    this.activeLoad = undefined;
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
   *
   * When the watchdog fires the timeout message is shown and the returned promise settles, so the "Use my location"
   * retry is not blocked. The attempt itself stays open (the browser call cannot be cancelled): a position that
   * arrives later, with no other selection made meanwhile, is applied and clears the message (architecture 3.3 step 4).
   */
  private locate(): Promise<void> {
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
    return new Promise<void>((settle) => {
      void this.safely(async () => {
        const result = await this.locationFlow.locate(locateAbort.signal, {
          onTimedOut: (error) => {
            if (isCurrent()) this.store.setState({ locationFlow: { status: 'error', error } });
            settle();
          },
        });
        if (!isCurrent() || isAbortedResult(result)) return;
        this.locateAbort = undefined;
        if (!result.ok) {
          this.store.setState({
            locationFlow: {
              status: 'error',
              error: result.error,
              ...(result.hint !== undefined ? { hint: result.hint } : {}),
            },
          });
          return;
        }
        const ticket = this.beginSelection();
        await this.showLocation(result.value.location, result.value.resolvedPlace, ticket);
      }).finally(settle);
    });
  }

  private async showLocation(location: Location, resolvedPlace: Location | undefined, ticket: Ticket): Promise<void> {
    // A successful selection clears earlier location and search errors.
    this.store.setState({
      selectedLocation: location,
      resolvedPlace,
      search: { status: 'idle' },
      locationFlow: { status: 'idle' },
    });
    this.activeLoad = ticket.token;
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
      if (this.activeLoad === ticket.token) this.activeLoad = undefined;
    }
  }

  private syncFavorites(): void {
    this.store.setState({
      favorites: this.favorites.list(),
      favoritesStorageUnavailable: this.favorites.storageUnavailable,
      favoritesDataDiscarded: this.favorites.dataDiscarded,
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

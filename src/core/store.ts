/**
 * View State Store (C3, architecture 4.3; FR-029, FR-044, NFR-001).
 *
 * One observable source of truth for everything the UI renders. State objects
 * are never mutated: every change produces a new state object, and listeners
 * are told after the change. A listener that throws is isolated: the change
 * stays committed and the remaining listeners still run.
 */
import type { Location, Section, TemperatureUnit, WeatherSnapshot } from './domain';
import type { AppError } from './errors';
import type { MessageId } from './messages';

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'choose'; readonly candidates: readonly Location[] }
  | { readonly status: 'error'; readonly error: AppError };

export type LocationFlowState =
  | { readonly status: 'idle' }
  | { readonly status: 'locating' }
  | { readonly status: 'error'; readonly error: AppError };

export interface TransientMessage {
  readonly id: number;
  readonly messageId: MessageId;
}

export interface ViewState {
  readonly selectedLocation?: Location;
  /**
   * For a device-location selection: the named place it resolved to, the only
   * thing that may be saved as a favorite. Undefined when unresolved.
   */
  readonly resolvedPlace?: Location;
  readonly snapshot?: WeatherSnapshot;
  readonly search: SearchState;
  readonly locationFlow: LocationFlowState;
  readonly favorites: readonly Location[];
  readonly favoritesStorageUnavailable: boolean;
  readonly temperatureUnit: TemperatureUnit;
  readonly messages: readonly TransientMessage[];
}

export type Listener = (state: ViewState) => void;

export function createInitialState(overrides: Partial<ViewState> = {}): ViewState {
  return {
    search: { status: 'idle' },
    locationFlow: { status: 'idle' },
    favorites: [],
    favoritesStorageUnavailable: false,
    temperatureUnit: 'C',
    messages: [],
    ...overrides,
  };
}

/**
 * If `next` is an error/loading section with no data but the same section had
 * data, carry the old data and time over: a failed update never erases prior data.
 */
function retainSection<T>(previous: Section<T>, next: Section<T>): Section<T> {
  if (next.data !== undefined || previous.data === undefined) return next;
  if (next.status !== 'error' && next.status !== 'loading') return next;
  return {
    ...next,
    data: previous.data,
    ...(previous.updatedAt !== undefined ? { updatedAt: previous.updatedAt } : {}),
  };
}

export class ViewStateStore {
  private state: ViewState;
  private readonly listeners = new Set<Listener>();
  private nextMessageId = 1;

  constructor(initial: ViewState = createInitialState()) {
    this.state = initial;
  }

  getState(): ViewState {
    return this.state;
  }

  /** Register a listener. Returns a function that unsubscribes it. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Shallow-merge a patch into a new state object and notify. */
  setState(patch: Partial<ViewState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  /**
   * Store a weather snapshot. For the same location, a section that arrives
   * without data keeps the previous data and time (retention rule); a different
   * location replaces the snapshot entirely.
   */
  setSnapshot(next: WeatherSnapshot): void {
    const previous = this.state.snapshot;
    const snapshot: WeatherSnapshot =
      previous !== undefined && previous.location.key === next.location.key
        ? {
            ...next,
            current: retainSection(previous.current, next.current),
            forecast: retainSection(previous.forecast, next.forecast),
          }
        : next;
    this.setState({ snapshot });
  }

  /**
   * A superseded load can leave sections stuck in 'loading'. Settle them: a
   * section with data becomes 'ready' again, one without becomes 'idle'.
   */
  settleInterruptedLoading(): void {
    const snapshot = this.state.snapshot;
    if (snapshot === undefined) return;
    const settle = <T>(section: Section<T>): Section<T> =>
      section.status !== 'loading' ? section : { ...section, status: section.data !== undefined ? 'ready' : 'idle' };
    const current = settle(snapshot.current);
    const forecast = settle(snapshot.forecast);
    if (current === snapshot.current && forecast === snapshot.forecast) return;
    this.setState({ snapshot: { ...snapshot, current, forecast } });
  }

  /** Add a transient message and return its ID. */
  pushMessage(messageId: MessageId): number {
    const id = this.nextMessageId;
    this.nextMessageId += 1;
    this.setState({ messages: [...this.state.messages, { id, messageId }] });
    return id;
  }

  dismissMessage(id: number): void {
    if (!this.state.messages.some((m) => m.id === id)) return;
    this.setState({ messages: this.state.messages.filter((m) => m.id !== id) });
  }

  private notify(): void {
    const state = this.state;
    for (const listener of [...this.listeners]) {
      // One faulty listener must not stop the others or abort the state change.
      try {
        listener(state);
      } catch {
        // Deliberately swallowed: the state is already committed.
      }
    }
  }
}

export type FavoriteAvailability = 'none' | 'can-add' | 'already-favorite' | 'needs-named-place';

/**
 * What the add-to-favorites control should do for the current state. A device
 * location that did not resolve to a named place is 'needs-named-place': the
 * control is not offered and a hint says to search the city by name.
 */
export function favoriteAvailability(state: ViewState): FavoriteAvailability {
  const selected = state.selectedLocation;
  if (selected === undefined) return 'none';
  const candidate = selected.source === 'device' ? state.resolvedPlace : selected;
  if (candidate === undefined) return 'needs-named-place';
  return state.favorites.some((f) => f.key === candidate.key) ? 'already-favorite' : 'can-add';
}

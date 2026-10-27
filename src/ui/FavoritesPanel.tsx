/**
 * Favorites UI (TASK-031; FR-032 to FR-037, FR-045, EC-014 to EC-016,
 * AC-006-1 to AC-006-6). What the add control does is decided by the core
 * selector `favoriteAvailability`; this component only renders that answer.
 *
 * The favorite whose weather is shown carries aria-current AND a visible text
 * marker, so it is not distinguished by colour alone. When adding or removing
 * takes away the control that had focus, focus moves to a favorite (or to the
 * section heading when the list is empty) instead of being dropped (NFR-003).
 */
import { useCallback, useRef } from 'react';
import { message } from '../core/messages';
import { favoriteAvailability } from '../core/store';
import { useUi, useViewState } from './context';
import { formatPlace } from './formatPlace';
import { LiveMessage } from './LiveMessage';
import { SECTIONS } from './sections';
import { unavailable, useGuardedAction } from './useGuardedAction';
import { useRestoreFocus } from './useRestoreFocus';

export function FavoritesPanel() {
  const { controller } = useUi();
  const state = useViewState();
  const availability = favoriteAvailability(state);
  const add = useGuardedAction(useCallback(() => controller.addFavorite(), [controller]));
  const shownKey = state.snapshot?.location.key;
  const listRef = useRef<HTMLUListElement>(null);
  /** Set when this panel's own add/remove control was used; only then may focus be moved. */
  const restore = useRef<{ index: number | undefined } | undefined>(undefined);

  const listSignature = `${availability}|${state.favorites.map((f) => f.key).join('\n')}`;
  useRestoreFocus(listSignature, () => {
    const request = restore.current;
    if (request === undefined) return null;
    restore.current = undefined;
    const selects = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.favorite-select') ?? []);
    const shownIndex = state.favorites.findIndex((f) => f.key === shownKey);
    const wanted = request.index ?? (shownIndex >= 0 ? shownIndex : 0);
    return selects[Math.min(wanted, selects.length - 1)] ?? document.getElementById(SECTIONS.favorites.headingId);
  });

  return (
    <div className="favorites-panel">
      {availability === 'can-add' ? (
        <button
          type="button"
          onClick={() => {
            if (add.pending) return;
            restore.current = { index: undefined };
            add.run();
          }}
          {...unavailable(add.pending)}
        >
          {message('ui.favorites.add')}
        </button>
      ) : null}
      {availability === 'already-favorite' ? <p className="note">{message('ui.favorites.alreadyAdded')}</p> : null}
      {availability === 'needs-named-place' ? <p className="note">{message('ui.favoriteNeedsName')}</p> : null}

      <LiveMessage className="favorites-notice">
        {state.favoritesStorageUnavailable ? <p className="note">{message('error.storageUnavailable')}</p> : null}
      </LiveMessage>

      {state.favorites.length === 0 ? (
        <p className="empty">{message('ui.favorites.empty')}</p>
      ) : (
        <ul className="favorites-list" ref={listRef}>
          {state.favorites.map((favorite, index) => {
            const place = formatPlace(favorite);
            const shown = shownKey === favorite.key;
            return (
              <li key={favorite.key}>
                <button
                  type="button"
                  className="favorite-select"
                  aria-current={shown ? 'true' : undefined}
                  onClick={() => void controller.selectFavorite(favorite.key)}
                  // WCAG 2.5.3 (Label in Name): the shown favorite has visible marker text, so it takes its
                  // accessible name from its content ("<place> Showing"); an aria-label that left the marker
                  // out would not contain the visible text. aria-current still conveys the state.
                  aria-label={shown ? undefined : message('ui.favorites.select', { place })}
                >
                  <span className="favorite-place">{place}</span>
                  {shown ? (
                    <>
                      {' '}
                      <span className="favorite-marker">{message('ui.favorites.showingMarker')}</span>
                    </>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="favorite-remove"
                  onClick={() => {
                    restore.current = { index };
                    void controller.removeFavorite(favorite.key);
                  }}
                  aria-label={message('ui.favorites.remove', { place })}
                >
                  {message('ui.favorites.removeShort')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

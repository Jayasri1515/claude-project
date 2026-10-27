/**
 * Status area (TASK-034; FR-044, NFR-003, NFR-004, AC-007-5). One polite live
 * region announces what is loading, plus transient messages the user can
 * dismiss. It renders message IDs through the central table only, so no raw
 * error text, stack, URL or credential can appear.
 *
 * This is the ONLY place the loading text (searching, finding the location,
 * loading, refreshing) is rendered, so it is announced exactly once. Dismissing
 * a message removes the focused button, so focus moves to the next Dismiss
 * button, or to the page title when none is left (NFR-003).
 *
 * The loading text is derived from store state and appears in the same render
 * that the state changes, which is within Config.loadingIndicatorMaxDelayMs.
 */
import { useRef } from 'react';
import { message } from '../core/messages';
import { useUi, useViewState } from './context';
import { LiveMessage } from './LiveMessage';
import { APP_TITLE_ID } from './sections';
import { useRestoreFocus } from './useRestoreFocus';

export function StatusArea() {
  const { store } = useUi();
  const state = useViewState();
  const { snapshot } = state;
  const areaRef = useRef<HTMLElement>(null);
  const dismissed = useRef(false);
  useRestoreFocus(state.messages, () => {
    if (!dismissed.current) return null;
    dismissed.current = false;
    return areaRef.current?.querySelector<HTMLElement>('button') ?? document.getElementById(APP_TITLE_ID);
  });

  const weatherLoading = snapshot?.current.status === 'loading' || snapshot?.forecast.status === 'loading';
  const weatherHasData = snapshot?.current.data !== undefined || snapshot?.forecast.data !== undefined;
  const loadingText =
    state.locationFlow.status === 'locating'
      ? message('ui.location.locating')
      : state.search.status === 'loading'
        ? message('ui.status.searching')
        : weatherLoading
          ? message(weatherHasData ? 'ui.status.refreshing' : 'ui.status.loadingWeather')
          : undefined;

  return (
    <section className="status-area" ref={areaRef} aria-label={message('ui.status.label')}>
      <LiveMessage>
        {loadingText !== undefined ? <p className="loading">{loadingText}</p> : null}
        {state.messages.map((item) => (
          <p key={item.id} className="transient-message">
            <span>{message(item.messageId)}</span>{' '}
            <button
              type="button"
              onClick={() => {
                dismissed.current = true;
                store.dismissMessage(item.id);
              }}
            >
              {message('ui.dismiss')}
            </button>
          </p>
        ))}
      </LiveMessage>
    </section>
  );
}

/**
 * "Use my location" control and hint (TASK-032; REQ-WF2-01 to
 * REQ-WF2-04, NFR-005, EC-007 to EC-009; F-004).
 * The app asks for the location itself when it opens (the controller's
 * `start()`); this control starts a new attempt after a denial, a timeout or
 * an unavailable position, or at any time the user chooses. City search is
 * never disabled. The privacy disclosure (M-24) is always visible in the footer. The button does not point at it with
 * aria-describedby: that would read the whole paragraph on every focus, and message-wording.md defines no shorter hint.
 *
 * While a lookup runs the button stays focusable (aria-disabled, not
 * `disabled`) and ignores activation, so focus is never dropped (NFR-003). The
 * "Detecting your location..." text and its "search instead" cue are announced
 * by the status area only; this component announces the failure messages.
 */
import { useCallback } from 'react';
import { message, messageForError } from '../core/messages';
import { useUi, useViewState } from './context';
import { LiveMessage } from './LiveMessage';
import { unavailable, useGuardedAction } from './useGuardedAction';

export function LocationControl() {
  const { controller } = useUi();
  const { locationFlow } = useViewState();
  const locate = useGuardedAction(useCallback(() => controller.useMyLocation(), [controller]));
  const locating = locationFlow.status === 'locating';
  const busy = locate.pending || locating;

  return (
    <div className="location-control">
      <button
        type="button"
        onClick={() => {
          if (!busy) locate.run();
        }}
        {...unavailable(busy)}
      >
        {message('ui.location.button')}
      </button>
      <LiveMessage className="location-status">
        {locationFlow.status === 'error' ? <p className="error-text">{messageForError(locationFlow.error)}</p> : null}
        {locationFlow.status === 'error' && locationFlow.hint !== undefined ? (
          <p className="note">{message(locationFlow.hint)}</p>
        ) : null}
      </LiveMessage>
    </div>
  );
}

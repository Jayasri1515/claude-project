/**
 * "Use my location" control, hint and disclosure (TASK-032; FR-008 to FR-011,
 * EC-007 to EC-009, NFR-005, AC-002-2 to AC-002-4; F-001, F-004).
 * Nothing here asks for permission on first paint: the controller is only
 * called when the user activates the button. City search is never disabled.
 *
 * While a lookup runs the button stays focusable (aria-disabled, not
 * `disabled`) and ignores activation, so focus is never dropped (NFR-003). The
 * "Finding your location..." text is announced by the status area only; this
 * component announces the failure messages.
 */
import { useCallback, useId } from 'react';
import { message, messageForError } from '../core/messages';
import { useUi, useViewState } from './context';
import { LiveMessage } from './LiveMessage';
import { unavailable, useGuardedAction } from './useGuardedAction';

export function LocationControl() {
  const { controller, demo } = useUi();
  const { locationFlow } = useViewState();
  const disclosureId = useId();
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
        aria-describedby={disclosureId}
        {...unavailable(busy)}
      >
        {message('ui.location.button')}
      </button>
      {demo ? (
        // Demo data is invented and nothing is sent anywhere, so the live disclosure would be false here.
        <p id={disclosureId} className="note demo-location-note">
          {message('ui.location.demoNote')}
        </p>
      ) : (
        <p id={disclosureId} className="note">
          {message('ui.location.disclosure')}
        </p>
      )}
      <LiveMessage className="location-status">
        {locationFlow.status === 'error' ? <p className="error-text">{messageForError(locationFlow.error)}</p> : null}
      </LiveMessage>
    </div>
  );
}

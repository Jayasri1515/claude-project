/**
 * Refresh control and last-updated text (TASK-030; FR-026 to FR-030,
 * AC-005-1 to AC-005-5, AC-P-02, AC-P-03). The button is visible whenever
 * weather is displayed and is unavailable while a refresh is running, both from
 * store state and from the shared guard that holds before the store updates.
 * It stays focusable (aria-disabled, not `disabled`) so focus is never dropped
 * while it is busy (NFR-003).
 */
import { deriveLastUpdated } from '../core/forecast';
import { formatLastUpdated } from '../core/format';
import { message } from '../core/messages';
import { useRefreshAction, useViewState } from './context';
import { unavailable } from './useGuardedAction';

export function RefreshBar() {
  const { snapshot } = useViewState();
  const refresh = useRefreshAction();

  if (snapshot === undefined) return null;
  const loading = snapshot.current.status === 'loading' || snapshot.forecast.status === 'loading';
  const busy = loading || refresh.pending;
  const lastUpdated = deriveLastUpdated(snapshot.current, snapshot.forecast);

  return (
    <div className="refresh-bar">
      <button
        type="button"
        onClick={() => {
          if (!busy) refresh.run();
        }}
        {...unavailable(busy)}
      >
        {message('ui.refresh')}
      </button>
      {lastUpdated !== undefined ? <span className="last-updated">{formatLastUpdated(lastUpdated)}</span> : null}
    </div>
  );
}

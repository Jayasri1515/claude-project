/**
 * Refresh control and update-time text (TASK-030; FR-026 to FR-030,
 * AC-005-1 to AC-005-5, AC-P-02, AC-P-03). The button is visible whenever
 * weather is displayed and is unavailable while a refresh is running, both from
 * store state and from the shared guard that holds before the store updates.
 * It stays focusable (aria-disabled, not `disabled`) so focus is never dropped
 * while it is busy (NFR-003).
 */
import { formatCurrentUpdated, formatForecastUpdated, formatLastUpdated } from '../core/format';
import { message } from '../core/messages';
import { useRefreshAction, useViewState } from './context';
import { LiveMessage } from './LiveMessage';
import { wholeFailureKeepsData } from './sectionFailure';
import { unavailable } from './useGuardedAction';

const isValid = (date: Date | undefined): date is Date => date !== undefined && !Number.isNaN(date.getTime());

/**
 * The update-time lines (U4, M-31 to M-33). Each section has its own last successful fetch time. When both are the
 * same, one line "Updated <time>"; when they differ (after a partial refresh), one labelled line per section so no
 * stale section sits under a newer time; a section that never loaded has no line.
 */
function updateLines(current: Date | undefined, forecast: Date | undefined): Array<{ key: string; text: string }> {
  const c = isValid(current) ? current : undefined;
  const f = isValid(forecast) ? forecast : undefined;
  if (c !== undefined && f !== undefined && c.getTime() === f.getTime()) {
    return [{ key: 'both', text: formatLastUpdated(c) }];
  }
  const lines: Array<{ key: string; text: string }> = [];
  if (c !== undefined) lines.push({ key: 'current', text: formatCurrentUpdated(c) });
  if (f !== undefined) lines.push({ key: 'forecast', text: formatForecastUpdated(f) });
  return lines;
}

export function RefreshBar() {
  const { snapshot, search } = useViewState();
  const refresh = useRefreshAction();

  if (snapshot === undefined) return null;
  const loading = snapshot.current.status === 'loading' || snapshot.forecast.status === 'loading';
  // A search still waiting for its answer also makes the control unavailable: the displayed city is about to be
  // replaced, and the controller ignores a refresh of it (A-Q19, DR-18).
  const busy = loading || refresh.pending || search.status === 'loading';
  const lines = updateLines(snapshot.current.updatedAt, snapshot.forecast.updatedAt);

  return (
    <div className="refresh-bar">
      {/* M-27 for a whole failure that kept earlier data; a single section's failure shows it beside that section. */}
      <LiveMessage className="refresh-status">
        {wholeFailureKeepsData(snapshot.current, snapshot.forecast) ? (
          <p className="note">{message('ui.refreshFailedStale')}</p>
        ) : null}
      </LiveMessage>
      <button
        type="button"
        onClick={() => {
          if (!busy) refresh.run();
        }}
        {...unavailable(busy)}
      >
        {message('ui.refresh')}
      </button>
      {lines.length > 0 ? (
        <span className="last-updated">
          {lines.map((line) => (
            <span key={line.key} className="updated-line">
              {line.text}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

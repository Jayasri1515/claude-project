/**
 * Current weather card (TASK-028; FR-014 to FR-016, FR-018, FR-019, FR-041,
 * FR-042, FR-044, AC-003-1 to AC-003-5, AC-007-2, AC-007-3, AC-P-04).
 * Every value is shown with its label and unit; a missing value reads
 * "Unavailable". The condition icon comes from the Lucide table in weatherIcons.ts (TASK-035).
 *
 * States: nothing chosen (empty text), loading, data, error (announced in a
 * polite live region that is always present, with Retry), and "has not loaded"
 * for a section that is idle with no data. Pressing Retry moves focus to the
 * section heading first, because the error block (and the button) is replaced
 * by the loading state (NFR-003).
 */
import { formatDataFrom, formatHumidity, formatTemperature } from '../core/format';
import { message, messageForError } from '../core/messages';
import { useRefreshAction, useViewState } from './context';
import { ConditionView } from './ConditionView';
import { formatPlace } from './formatPlace';
import { LiveMessage } from './LiveMessage';
import { focusById, SECTIONS } from './sections';
import { unavailable } from './useGuardedAction';
import { WeatherCredit } from './WeatherCredit';

export function CurrentWeatherCard() {
  const { snapshot, temperatureUnit } = useViewState();
  const refresh = useRefreshAction();

  if (snapshot === undefined) {
    return (
      <div className="weather-card">
        <p className="empty">{message('ui.current.empty')}</p>
        <LiveMessage className="section-status" />
      </div>
    );
  }
  const section = snapshot.current;
  const data = section.data;
  const loading = section.status === 'loading';
  const failed = section.status === 'error' && section.error !== undefined;

  const onRetry = (): void => {
    if (refresh.pending) return;
    focusById(SECTIONS.current.headingId);
    refresh.run();
  };

  return (
    <div className="weather-card" aria-busy={loading}>
      <h3>{formatPlace(snapshot.location)}</h3>
      {data === undefined && loading ? <p>{message('ui.loading')}</p> : null}
      {data === undefined && !loading && !failed ? (
        <p className="empty">{message('ui.current.notLoaded', { refresh: message('ui.refresh') })}</p>
      ) : null}
      {data !== undefined ? (
        <dl className="values">
          <div>
            <dt>{message('ui.label.temperature')}</dt>
            <dd>{formatTemperature(data.temperatureC, temperatureUnit)}</dd>
          </div>
          <div>
            <dt>{message('ui.label.humidity')}</dt>
            <dd>{formatHumidity(data.humidityPct)}</dd>
          </div>
          <div>
            <dt>{message('ui.label.condition')}</dt>
            <dd>
              <ConditionView condition={data.condition} text={data.conditionText} />
            </dd>
          </div>
        </dl>
      ) : null}
      {data !== undefined && loading ? <p className="note">{message('ui.current.updating')}</p> : null}
      <WeatherCredit showing={data !== undefined} />
      <LiveMessage className="section-status">
        {failed && section.error !== undefined ? (
          <>
            <p className="error-text">{messageForError(section.error)}</p>
            {data !== undefined && section.updatedAt !== undefined ? (
              <p className="note">{formatDataFrom(section.updatedAt)}</p>
            ) : null}
          </>
        ) : null}
      </LiveMessage>
      {failed ? (
        <button type="button" onClick={onRetry} {...unavailable(refresh.pending)}>
          {message('ui.retry')}
        </button>
      ) : null}
    </div>
  );
}

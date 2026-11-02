/**
 * Forecast list (TASK-029; FR-020 to FR-025, FR-042, FR-044, AC-004-1 to
 * AC-004-5). Shows exactly `Config.forecastDays` rows: real days first, then
 * "unavailable" rows. Dates are the provider's calendar dates at the location
 * and are shown as plain calendar dates, so the device time zone cannot shift
 * them. When today is the first forecast day (Config.forecastIncludesToday) the first row is labelled "Today"
 * (M-30); the adapter always asks for the location's own time zone, so day 0 is the location's today.
 *
 * States: nothing chosen, loading, rows, error (polite live region that is
 * always present, with Retry; Retry moves focus to the section heading first
 * because the error block is replaced by the loading state), and "has not
 * loaded" for a section that is idle with no data.
 */
import { formatForecastDate, formatForecastRange } from '../core/format';
import { padForecast } from '../core/forecast';
import { message } from '../core/messages';
import { useRefreshAction, useUi, useViewState } from './context';
import { ConditionView } from './ConditionView';
import { LiveMessage } from './LiveMessage';
import { focusById, SECTIONS } from './sections';
import { sectionFailureText } from './sectionFailure';
import { unavailable } from './useGuardedAction';
import { WeatherCredit } from './WeatherCredit';

export function ForecastList() {
  const { config } = useUi();
  const { snapshot, temperatureUnit } = useViewState();
  const refresh = useRefreshAction();

  if (snapshot === undefined) {
    return (
      <div className="forecast">
        <p className="empty">{message('ui.forecast.empty')}</p>
        <LiveMessage className="section-status" />
      </div>
    );
  }
  const section = snapshot.forecast;
  const loading = section.status === 'loading';
  const failed = section.status === 'error' && section.error !== undefined;
  const failure = sectionFailureText(section, snapshot.current, 'ui.forecast.loadFailed');
  const showRows = section.data !== undefined || section.status === 'ready';
  const slots = padForecast(section.data ?? [], config.forecastDays);

  const onRetry = (): void => {
    if (refresh.pending) return;
    focusById(SECTIONS.forecast.headingId);
    refresh.run();
  };

  return (
    <div className="forecast" aria-busy={loading}>
      {section.data === undefined && loading ? <p>{message('ui.loading')}</p> : null}
      {!showRows && !loading && !failed ? (
        <p className="empty">{message('ui.forecast.notLoaded', { refresh: message('ui.refresh') })}</p>
      ) : null}
      {showRows ? (
        <ol className="forecast-list">
          {slots.map((slot, index) =>
            slot.kind === 'day' ? (
              <li key={`${slot.day.date}-${index}`}>
                {index === 0 && config.forecastIncludesToday ? (
                  <span className="forecast-today">{message('ui.forecast.today')}</span>
                ) : null}
                <span className="forecast-date">{formatForecastDate(slot.day.date)}</span>
                <ConditionView condition={slot.day.condition} text={slot.day.conditionText} surface="forecast" />
                <span className="forecast-range">{formatForecastRange(slot.day, temperatureUnit)}</span>
              </li>
            ) : (
              <li key={`unavailable-${index}`} className="forecast-unavailable">
                {message('ui.unavailable')}
              </li>
            ),
          )}
        </ol>
      ) : null}
      <WeatherCredit showing={section.data !== undefined && section.data.length > 0} />
      <LiveMessage className="section-status">
        {failure !== undefined ? (
          <>
            {failure.staleNote !== undefined ? <p className="note">{failure.staleNote}</p> : null}
            <p className="error-text">{failure.text}</p>
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

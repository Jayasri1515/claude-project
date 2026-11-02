/**
 * Search UI (TASK-027; FR-001, FR-003 to FR-007, AC-001-1 to AC-001-5, AC-P-01).
 * Sends the text as typed to the controller; validation (empty, too long) and
 * the "no request on empty input" rule live in the core, not here.
 *
 * Submit is never blocked: a search still pending is superseded by the newer
 * one in the controller, so the latest intent wins (F-007) and the user can
 * correct a typo without waiting. Only errors are announced here; the
 * "Searching..." text comes from the status area alone (one announced source).
 *
 * Focus (NFR-003): after a search the focus moves to its outcome (the chooser
 * heading, or the current-weather heading for a single match), but only when
 * focus is still in the search form or lost, so a user who has moved on is not
 * pulled back. Choosing a candidate moves focus to the current-weather heading
 * at once, because the chooser (and the pressed button) disappears.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AppError } from '../core/errors';
import { messageForError, message } from '../core/messages';
import { useUi, useViewState } from './context';
import { formatPlace } from './formatPlace';
import { LiveMessage } from './LiveMessage';
import { PickListCredit } from './PickListCredit';
import { focusById, focusIsLost, SECTIONS } from './sections';
import { unavailable, useGuardedAction } from './useGuardedAction';
import type { Location } from '../core/domain';

/**
 * Failures where trying the same text again can help, so the Retry control (M-34, REQ-WF1-05) is offered. A text the
 * user must change (nothing found, empty or too long) is not retried.
 */
const RETRYABLE_SEARCH_ERRORS: ReadonlySet<AppError['kind']> = new Set([
  'service',
  'network',
  'rate_limited',
  'timeout',
  'invalid_response',
]);

export function SearchPanel() {
  const { controller } = useUi();
  const { search } = useViewState();
  const inputId = useId();
  const chooseHeadingId = useId();
  const [text, setText] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The text of the last submitted search (trimmed, as the search service reads it), for Retry. */
  const lastSubmitted = useRef('');
  const chooseHeadingRef = useRef<HTMLHeadingElement>(null);
  /** True from a submit until its outcome (or a newer state) has been handled. */
  const awaitingOutcome = useRef(false);

  useEffect(() => {
    if (!awaitingOutcome.current || search.status === 'loading') return;
    awaitingOutcome.current = false;
    const active = document.activeElement;
    const inForm = active !== null && panelRef.current?.contains(active) === true;
    if (!inForm && !focusIsLost()) return;
    if (search.status === 'choose') chooseHeadingRef.current?.focus();
    else if (search.status === 'idle') focusById(SECTIONS.current.headingId);
  }, [search]);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    awaitingOutcome.current = true;
    lastSubmitted.current = text.trim();
    void controller.searchCity(text);
  };

  // Retry re-submits the last text through a guarded action, so a second activation while it runs is ignored.
  const retry = useGuardedAction(useCallback(() => controller.searchCity(lastSubmitted.current), [controller]));
  const onRetry = (): void => {
    if (retry.pending) return;
    // The Retry button disappears while the search runs: keep focus in the search form, where the outcome is found.
    inputRef.current?.focus();
    awaitingOutcome.current = true;
    retry.run();
  };
  // A retryable error can only follow a submitted search, so there is always a last text to send.
  const canRetry = search.status === 'error' && RETRYABLE_SEARCH_ERRORS.has(search.error.kind);

  const onChoose = (candidate: Location): void => {
    focusById(SECTIONS.current.headingId);
    void controller.chooseCandidate(candidate);
  };

  return (
    <div className="search-panel" ref={panelRef}>
      <form onSubmit={onSubmit} role="search">
        <label htmlFor={inputId}>{message('ui.search.label')}</label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={text}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit">{message('ui.search.submit')}</button>
      </form>
      <LiveMessage className="search-status">
        {search.status === 'error' ? <p className="error-text">{messageForError(search.error)}</p> : null}
      </LiveMessage>
      {canRetry ? (
        <button type="button" className="search-retry" onClick={onRetry} {...unavailable(retry.pending)}>
          {message('ui.retry')}
        </button>
      ) : null}
      {search.status === 'choose' ? (
        <div className="candidates" role="group" aria-labelledby={chooseHeadingId}>
          <h3 id={chooseHeadingId} ref={chooseHeadingRef} tabIndex={-1}>
            {message('ui.search.chooseHeading')}
          </h3>
          <ul>
            {search.candidates.map((candidate) => (
              <li key={candidate.key}>
                <button type="button" onClick={() => onChoose(candidate)}>
                  {formatPlace(candidate)}
                </button>
              </li>
            ))}
          </ul>
          <PickListCredit />
        </div>
      ) : null}
    </div>
  );
}

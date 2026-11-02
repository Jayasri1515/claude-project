/**
 * Which failure texts a weather section shows (message-wording.md, kind to message mapping and M-25 to M-27).
 *
 * - Whole failure (both sections failed): each section shows the message of its error kind (M-03 to M-06). When earlier
 *   data is kept, M-27 is shown once above the weather block (RefreshBar), not in each section.
 * - Partial failure (this section failed, the other did not): an unreadable section shows M-25 (current) or M-26
 *   (forecast); any other kind shows its own message. When this section keeps earlier data, M-27 comes first.
 */
import type { Section } from '../core/domain';
import { message, messageForError } from '../core/messages';
import type { MessageId } from '../core/messages';

export interface SectionFailureText {
  /** M-27, shown before `text` when this section failed alone and keeps earlier data. */
  readonly staleNote: string | undefined;
  readonly text: string | undefined;
}

export function sectionFailureText(
  own: Section<unknown>,
  other: Section<unknown>,
  partialMessageId: MessageId,
): SectionFailureText | undefined {
  const error = own.error;
  if (own.status !== 'error' || error === undefined) return undefined;
  const whole = other.status === 'error';
  if (whole) return { staleNote: undefined, text: messageForError(error) };
  return {
    staleNote: own.data !== undefined ? message('ui.refreshFailedStale') : undefined,
    text: error.kind === 'invalid_response' ? message(partialMessageId) : messageForError(error),
  };
}

/** True when both sections failed and at least one still shows earlier data: M-27 goes above the weather block. */
export function wholeFailureKeepsData(current: Section<unknown>, forecast: Section<unknown>): boolean {
  return (
    current.status === 'error' &&
    forecast.status === 'error' &&
    (current.data !== undefined || forecast.data !== undefined)
  );
}

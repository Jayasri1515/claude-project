import { useCallback, useMemo, useRef, useState } from 'react';

export interface GuardedAction {
  /** Start the action; ignored at once while an earlier run is still pending. */
  readonly run: () => void;
  readonly pending: boolean;
}

/**
 * Wraps an intent so a second activation while the first is still pending is
 * ignored at once (a ref, not state, so it holds even before React re-renders).
 * `pending` is for marking the control unavailable (FR-028, AC-P-03).
 */
export function useGuardedAction(action: () => Promise<void>): GuardedAction {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = useCallback((): void => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    void action().finally(() => {
      busy.current = false;
      setPending(false);
    });
  }, [action]);
  return useMemo(() => ({ run, pending }), [run, pending]);
}

/**
 * Attributes that mark a button unavailable WITHOUT the `disabled` attribute.
 * A natively disabled button drops keyboard focus (focus falls back to the page
 * start), so controls that are busy stay focusable with aria-disabled and their
 * click handlers ignore activation (NFR-003).
 */
export function unavailable(isUnavailable: boolean): { 'aria-disabled'?: true } {
  return isUnavailable ? { 'aria-disabled': true } : {};
}

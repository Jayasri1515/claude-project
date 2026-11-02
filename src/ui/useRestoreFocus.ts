import { useEffect, useRef } from 'react';
import { focusIsLost } from './sections';

/**
 * When `signal` changes and keyboard focus has been lost (the focused control
 * was removed by that change), move focus to the element `fallback` returns.
 * Compares against the previous value instead of counting runs, so it is safe
 * under React StrictMode's repeated effect runs: nothing moves on mount.
 */
export function useRestoreFocus(signal: unknown, fallback: () => HTMLElement | null | undefined): void {
  const previous = useRef(signal);
  const latest = useRef(fallback);
  // Keep the newest callback without writing a ref during render. Declared before
  // the effect below so it has run by the time that effect reads it.
  useEffect(() => {
    latest.current = fallback;
  });
  useEffect(() => {
    const changed = previous.current !== signal;
    previous.current = signal;
    if (changed && focusIsLost()) latest.current()?.focus();
  }, [signal]);
}

/**
 * Responsive layout tier from the configured breakpoints (FR-043, NFR-002).
 * Breakpoint widths are Config values, not CSS literals: the tier is exposed as
 * a `data-layout` attribute and the stylesheet keys off it. Where
 * `window.matchMedia` is missing the narrow (mobile-first) layout is used.
 * Older browsers only have the deprecated addListener/removeListener on a
 * MediaQueryList; those are used when addEventListener is absent.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { Breakpoints } from '../core/config';

export type LayoutTier = 'narrow' | 'wide' | 'extra-wide';

function query(minWidthPx: number): MediaQueryList | undefined {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(`(min-width: ${minWidthPx}px)`)
    : undefined;
}

/** Listen for changes on a media query; returns the function that stops listening. */
export function watchMediaQuery(list: MediaQueryList, onChange: () => void): () => void {
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }
  if (typeof list.addListener === 'function') {
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }
  return () => undefined;
}

export function useLayout(breakpoints: Breakpoints): LayoutTier {
  const { wide, extraWide } = breakpoints;
  const { subscribe, getSnapshot } = useMemo(() => {
    const read = (): LayoutTier => {
      if (query(extraWide)?.matches === true) return 'extra-wide';
      if (query(wide)?.matches === true) return 'wide';
      return 'narrow';
    };
    const sub = (onChange: () => void): (() => void) => {
      const stops = [query(wide), query(extraWide)]
        .filter((q): q is MediaQueryList => q !== undefined)
        .map((list) => watchMediaQuery(list, onChange));
      return () => {
        for (const stop of stops) stop();
      };
    };
    return { subscribe: sub, getSnapshot: read };
  }, [wide, extraWide]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 'narrow');
}

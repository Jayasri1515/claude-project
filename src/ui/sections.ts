/**
 * Section and landmark identifiers, shared by the shell, the navigation links
 * and the focus helpers (NFR-003). The IDs are DOM identifiers, not user text.
 * Every heading that can receive focus carries tabIndex -1, so a navigation
 * link or a script can move keyboard and screen reader focus onto it.
 */
import type { MessageId } from '../core/messages';

export interface SectionDef {
  readonly id: string;
  readonly headingId: string;
  readonly navId: MessageId;
  readonly titleId: MessageId;
}

export const SECTIONS = {
  search: {
    id: 'section-search',
    headingId: 'section-search-heading',
    navId: 'ui.nav.search',
    titleId: 'ui.search.heading',
  },
  current: {
    id: 'section-current',
    headingId: 'section-current-heading',
    navId: 'ui.nav.current',
    titleId: 'ui.current.heading',
  },
  forecast: {
    id: 'section-forecast',
    headingId: 'section-forecast-heading',
    navId: 'ui.nav.forecast',
    titleId: 'ui.forecast.heading',
  },
  favorites: {
    id: 'section-favorites',
    headingId: 'section-favorites-heading',
    navId: 'ui.nav.favorites',
    titleId: 'ui.favorites.heading',
  },
} as const satisfies Readonly<Record<string, SectionDef>>;

/** Navigation order: one order at every width. */
export const SECTION_ORDER: readonly SectionDef[] = [
  SECTIONS.search,
  SECTIONS.current,
  SECTIONS.forecast,
  SECTIONS.favorites,
];

export const APP_TITLE_ID = 'app-title';

/** Move focus to the element with this id. Returns true when it now has focus. */
export function focusById(id: string): boolean {
  const element = document.getElementById(id);
  if (element === null) return false;
  element.focus();
  return document.activeElement === element;
}

/** True when nothing meaningful has focus (for example the focused element was removed). */
export function focusIsLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === document.documentElement;
}

/**
 * A link to another site (TASK-025). Opens in a new tab so the user's search and weather stay on screen;
 * `rel="noopener noreferrer"` keeps the target page from reaching back into this one or learning where the visitor
 * came from. The new-tab hint is part of the link's accessible name (visually hidden), and the visible words stay
 * first, so the name still contains the visible label (WCAG 2.5.3). At least 44 x 44 CSS px (see `.footer-link`).
 */
import type { ReactNode } from 'react';
import { message } from '../core/messages';

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="footer-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> {message('ui.link.newTab')}</span>
    </a>
  );
}

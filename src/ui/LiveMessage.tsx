import type { ReactNode } from 'react';

/**
 * A polite live region that is always in the document, so text placed in it
 * later is announced by assistive technology (FR-044, NFR-003).
 */
export function LiveMessage({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" {...(className !== undefined ? { className } : {})}>
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';

/** Text for assistive technology that is not shown on screen. */
export function VisuallyHidden({ children, id }: { children?: ReactNode; id?: string }) {
  return (
    <span className="visually-hidden" id={id}>
      {children}
    </span>
  );
}

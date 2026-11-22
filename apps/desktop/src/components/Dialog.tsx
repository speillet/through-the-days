// A div-based modal dialog (HTMLDialogElement behaves differently across WebKit
// versions and is missing in jsdom). While open: everything else is inert, Tab
// stays inside, Escape closes, and focus returns to where it was.

import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from './classNames';

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose(): void;
  /** Read with the title when the dialog opens (aria-describedby). */
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
  /** Element to focus first; defaults to the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Escape calls onClose unless this is false. */
  closeOnEscape?: boolean;
  className?: string;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.closest('[inert]'));
}

export function Dialog({ open, ...props }: DialogProps) {
  return open ? <OpenDialog {...props} /> : null;
}

function OpenDialog({
  title,
  onClose,
  description,
  children,
  footer,
  role = 'dialog',
  initialFocus,
  closeOnEscape = true,
  className,
}: Omit<DialogProps, 'open'>) {
  const titleId = useId();
  const descriptionId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef(initialFocus);

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return undefined;
    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const madeInert: Element[] = [];
    for (const sibling of Array.from(document.body.children)) {
      if (sibling === backdrop || sibling.contains(backdrop) || sibling.hasAttribute('inert')) continue;
      sibling.setAttribute('inert', '');
      madeInert.push(sibling);
    }
    (initialFocusRef.current?.current ?? focusableWithin(panel)[0] ?? panel).focus();
    return () => {
      for (const element of madeInert) element.removeAttribute('inert');
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (closeOnEscape) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableWithin(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      // Clicking the backdrop must not move focus out of the dialog.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={classNames('dialog', className)}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className="dialog__description">
            {description}
          </div>
        ) : null}
        {children ? <div className="dialog__body">{children}</div> : null}
        {footer ? <div className="dialog__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

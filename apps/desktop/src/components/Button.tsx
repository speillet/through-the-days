import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react';
import { classNames } from './classNames';
import { TAB_STOP } from './keyboard';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: 'regular' | 'small';
  /** Decorative icon shown before the label. */
  icon?: ReactNode;
  /** Work in progress: the button keeps focus but ignores activation. */
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'regular',
  icon,
  busy = false,
  className,
  type = 'button',
  tabIndex = TAB_STOP,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...rest}
      type={type}
      tabIndex={tabIndex}
      className={classNames('button', `button--${variant}`, size === 'small' && 'button--small', className)}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest['aria-disabled'] || undefined}
      onClick={handleClick}
    >
      {icon ? (
        <span className="button__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

// An inline message. Polite notices use role="status"; urgent ones use role="alert".
// The tone is shown with an icon and wording as well as colour.

import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { classNames } from './classNames';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Defaults to assertive for errors and polite otherwise; "off" for static explanations. */
  politeness?: 'polite' | 'assertive' | 'off';
  className?: string;
  id?: string;
}

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert } as const;

export function Notice({ tone = 'info', title, children, actions, politeness, className, id }: NoticeProps) {
  const live = politeness ?? (tone === 'error' ? 'assertive' : 'polite');
  const role = live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined;
  const Icon = ICONS[tone];
  return (
    <div id={id} role={role} className={classNames('notice', `notice--${tone}`, className)}>
      <Icon className="notice__icon" aria-hidden="true" size={18} strokeWidth={2} />
      <div className="notice__content">
        {title ? <p className="notice__title">{title}</p> : null}
        {children ? <div className="notice__body">{children}</div> : null}
        {actions ? <div className="notice__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

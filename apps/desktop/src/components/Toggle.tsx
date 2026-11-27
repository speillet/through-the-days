// A labelled on/off switch built on a native checkbox (role="switch"), so it is
// keyboard operable and announced as "on"/"off". The thumb position shows the
// state without relying on colour.

import { useId, type ReactNode } from 'react';
import { TAB_STOP } from './keyboard';

interface ToggleProps {
  label: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, hint, disabled }: ToggleProps) {
  const generated = useId();
  const controlId = `toggle-${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  return (
    <div className="toggle-field">
      <label className="toggle" htmlFor={controlId}>
        <input
          id={controlId}
          type="checkbox"
          role="switch"
          tabIndex={TAB_STOP}
          className="toggle__input"
          checked={checked}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="toggle__track" aria-hidden="true">
          <span className="toggle__thumb" />
        </span>
        <span className="toggle__label">{label}</span>
      </label>
      {hint ? (
        <p id={hintId} className="toggle__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

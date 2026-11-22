// A labelled native checkbox with an optional hint read by VoiceOver. The check
// mark, not colour, shows the state.

import { useId, type ReactNode } from 'react';
import { TAB_STOP } from '../../components/keyboard';

export interface CheckboxProps {
  label: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ label, checked, onChange, hint, disabled }: CheckboxProps) {
  const id = `checkbox-${useId()}`;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="checkbox-field">
      <label className="checkbox" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          tabIndex={TAB_STOP}
          className="checkbox__input"
          checked={checked}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="checkbox__label">{label}</span>
      </label>
      {hint ? (
        <p id={hintId} className="checkbox__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

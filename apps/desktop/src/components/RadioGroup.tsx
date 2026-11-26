// A labelled set of native radio buttons: arrow keys move between options and
// VoiceOver announces the group, the option and its position.

import { useId, type ReactNode } from 'react';
import { classNames } from './classNames';
import { TAB_STOP } from './keyboard';

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
}

interface RadioGroupProps<T extends string> {
  legend: ReactNode;
  value: T | null;
  options: readonly RadioOption<T>[];
  onChange(value: T): void;
  name?: string;
  hint?: ReactNode;
  legendHidden?: boolean;
  /** "row" lays short options out side by side. */
  layout?: 'row' | 'column';
  disabled?: boolean;
  className?: string;
}

export function RadioGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
  hint,
  legendHidden,
  layout = 'column',
  disabled,
  className,
}: RadioGroupProps<T>) {
  const generated = useId();
  const groupName = name ?? `radio-${generated}`;
  const hintId = hint ? `radio-${generated}-hint` : undefined;
  return (
    <fieldset
      className={classNames('radio-group', `radio-group--${layout}`, className)}
      aria-describedby={hintId}
      disabled={disabled}
    >
      <legend className={legendHidden ? 'visually-hidden' : 'radio-group__legend'}>{legend}</legend>
      {hint ? (
        <p id={hintId} className="radio-group__hint">
          {hint}
        </p>
      ) : null}
      <div className="radio-group__options">
        {options.map((option) => (
          <label
            key={option.value}
            className={classNames('radio-option', option.value === value && 'radio-option--checked')}
          >
            <input
              type="radio"
              tabIndex={TAB_STOP}
              className="radio-option__input"
              name={groupName}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="radio-option__text">
              <span className="radio-option__label">{option.label}</span>
              {option.description ? <span className="radio-option__description">{option.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

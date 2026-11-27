// Labelled text inputs. The hint and error are linked with aria-describedby and
// the error also sets aria-invalid, so VoiceOver reads them with the field.

import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { classNames } from './classNames';

interface FieldOwnProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Keeps the label for assistive technology only. */
  labelHidden?: boolean;
}

type TextFieldProps = FieldOwnProps & Omit<ComponentPropsWithRef<'input'>, 'children'>;
type TextAreaProps = FieldOwnProps & Omit<ComponentPropsWithRef<'textarea'>, 'children'>;

function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode, describedBy: string | undefined) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedByIds = [describedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { controlId, hintId, errorId, describedByIds };
}

function FieldFrame({
  controlId,
  label,
  labelHidden,
  hint,
  hintId,
  error,
  errorId,
  className,
  children,
}: FieldOwnProps & {
  controlId: string;
  hintId?: string;
  errorId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames('field', error ? 'field--invalid' : null, className)}>
      <label htmlFor={controlId} className={labelHidden ? 'visually-hidden' : 'field__label'}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ label, hint, error, labelHidden, id, className, ...input }: TextFieldProps) {
  const { controlId, hintId, errorId, describedByIds } = useFieldIds(id, hint, error, input['aria-describedby']);
  return (
    <FieldFrame {...{ controlId, label, labelHidden, hint, hintId, error, errorId, className }}>
      <input
        type="text"
        {...input}
        id={controlId}
        className="field__control"
        aria-invalid={error ? true : input['aria-invalid']}
        aria-describedby={describedByIds}
      />
    </FieldFrame>
  );
}

export function TextArea({ label, hint, error, labelHidden, id, className, ...textarea }: TextAreaProps) {
  const { controlId, hintId, errorId, describedByIds } = useFieldIds(id, hint, error, textarea['aria-describedby']);
  return (
    <FieldFrame {...{ controlId, label, labelHidden, hint, hintId, error, errorId, className }}>
      <textarea
        rows={3}
        {...textarea}
        id={controlId}
        className="field__control field__control--multiline"
        aria-invalid={error ? true : textarea['aria-invalid']}
        aria-describedby={describedByIds}
      />
    </FieldFrame>
  );
}

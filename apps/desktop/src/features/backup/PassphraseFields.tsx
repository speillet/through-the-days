// The new-passphrase fields used wherever a backup passphrase is chosen: typed
// twice so a slip of the finger cannot lock away future backups, an optional
// "show" switch, and the opt-in Keychain choice (off unless the person ticks it).

import { useState, type Ref, type RefObject } from 'react';
import { TextField } from '../../components/TextField';
import { PASSPHRASE_MIN_LENGTH } from '../../domain/backup';
import { Checkbox } from './Checkbox';
import type { PassphraseProblems } from './status';

export interface PassphraseValues {
  passphrase: string;
  confirmation: string;
  remember: boolean;
}

export const EMPTY_PASSPHRASE: PassphraseValues = { passphrase: '', confirmation: '', remember: false };

interface PassphraseFieldsProps {
  values: PassphraseValues;
  onChange(values: PassphraseValues): void;
  problems?: PassphraseProblems;
  disabled?: boolean;
  passphraseRef?: Ref<HTMLInputElement>;
  confirmationRef?: Ref<HTMLInputElement>;
}

/**
 * Moves focus to the first field with a problem, as Erase and Restore do, so VoiceOver reads
 * its error instead of staying silent on the button that was pressed.
 */
export function focusFirstProblem(
  problems: PassphraseProblems,
  passphraseRef: RefObject<HTMLInputElement | null>,
  confirmationRef: RefObject<HTMLInputElement | null>,
) {
  if (problems.passphrase) passphraseRef.current?.focus();
  else if (problems.confirmation) confirmationRef.current?.focus();
}

export function PassphraseFields({
  values,
  onChange,
  problems = {},
  disabled,
  passphraseRef,
  confirmationRef,
}: PassphraseFieldsProps) {
  const [visible, setVisible] = useState(false);
  const type = visible ? 'text' : 'password';
  return (
    <div className="passphrase-fields">
      <TextField
        ref={passphraseRef}
        label="Backup passphrase"
        type={type}
        hint={`At least ${PASSPHRASE_MIN_LENGTH} characters. A short sentence is easier to remember.`}
        autoComplete="new-password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={values.passphrase}
        error={problems.passphrase}
        disabled={disabled}
        onChange={(event) => onChange({ ...values, passphrase: event.currentTarget.value })}
      />
      <TextField
        ref={confirmationRef}
        label="Confirm passphrase"
        type={type}
        autoComplete="new-password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={values.confirmation}
        error={problems.confirmation}
        disabled={disabled}
        onChange={(event) => onChange({ ...values, confirmation: event.currentTarget.value })}
      />
      <Checkbox label="Show passphrase" checked={visible} onChange={setVisible} disabled={disabled} />
      <Checkbox
        label="Remember in macOS Keychain"
        hint="Keychain keeps it on this Mac only. If you leave this off, the app asks for it again after it restarts."
        checked={values.remember}
        disabled={disabled}
        onChange={(remember) => onChange({ ...values, remember })}
      />
    </div>
  );
}

/** Why the passphrase matters, shown wherever one is chosen. */
export function PassphraseGuidance() {
  return (
    <p className="passphrase-guidance">
      Store this passphrase somewhere safe, such as a password manager. Backups can’t be restored without it, on this
      Mac or any other, and it can’t be reset.
    </p>
  );
}

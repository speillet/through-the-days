// Sets, changes or re-enters the backup passphrase. The journal validates it
// again; the passphrase never leaves this dialog except in that one command, and
// the fields are cleared as soon as it is accepted.

import { useId, useRef, useState, type FormEvent } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupStatus } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import {
  EMPTY_PASSPHRASE,
  focusFirstProblem,
  PassphraseFields,
  PassphraseGuidance,
  type PassphraseValues,
} from './PassphraseFields';
import { hasProblems, newPassphraseProblems, type PassphraseProblems } from './status';

/** "set": none yet; "change": replacing one; "due": a backup is waiting for it. */
export type PassphrasePurpose = 'set' | 'change' | 'due';

const TITLES: Record<PassphrasePurpose, string> = {
  set: 'Set a backup passphrase',
  change: 'Change the backup passphrase',
  due: 'Enter your backup passphrase',
};

export interface PassphraseDialogProps {
  open: boolean;
  purpose: PassphrasePurpose;
  /** The passphrase is remembered in Keychain now; the Remember choice starts from it. */
  remembered?: boolean;
  onClose(): void;
  /** Receives the journal's status once it accepted the passphrase. */
  onSaved(status: BackupStatus): void;
}

export function PassphraseDialog({ open, ...props }: PassphraseDialogProps) {
  return open ? <OpenPassphraseDialog {...props} /> : null;
}

function OpenPassphraseDialog({ purpose, remembered = false, onClose, onSaved }: Omit<PassphraseDialogProps, 'open'>) {
  const api = useApi();
  const formId = useId();
  const passphraseRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  // Re-entering a remembered passphrase keeps it remembered unless the person unticks the box.
  const [values, setValues] = useState<PassphraseValues>({ ...EMPTY_PASSPHRASE, remember: remembered });
  const [problems, setProblems] = useState<PassphraseProblems>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = newPassphraseProblems(values.passphrase, values.confirmation);
    setProblems(found);
    setError(null);
    if (hasProblems(found)) {
      focusFirstProblem(found, passphraseRef, confirmationRef);
      return;
    }
    setBusy(true);
    try {
      const status = await api.setBackupPassphrase(values.passphrase, values.remember);
      setValues(EMPTY_PASSPHRASE);
      onSaved(status);
    } catch (caught) {
      setError(toCommandError(caught).message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={TITLES[purpose]}
      onClose={() => {
        if (!busy) onClose();
      }}
      initialFocus={passphraseRef}
      description={
        <>
          {purpose === 'due' ? (
            <p>A backup is due. Enter your backup passphrase so the app can make today’s encrypted backup.</p>
          ) : null}
          <PassphraseGuidance />
          {purpose === 'set' ? null : (
            <p>Existing backups keep the passphrase they were made with. New backups use the one you enter here.</p>
          )}
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} busy={busy}>
            {purpose === 'due' ? 'Save and back up' : 'Save passphrase'}
          </Button>
        </>
      }
    >
      <form id={formId} className="dialog-form" noValidate onSubmit={(event) => void submit(event)}>
        <PassphraseFields
          values={values}
          onChange={setValues}
          problems={problems}
          passphraseRef={passphraseRef}
          confirmationRef={confirmationRef}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
      </form>
    </Dialog>
  );
}

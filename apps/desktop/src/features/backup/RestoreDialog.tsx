// Restores one backup after asking for the passphrase it was made with. The journal
// validates the backup before replacing anything, so every failure leaves the
// current journal as it was; the dialog says so.

import { useId, useRef, useState, type FormEvent } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupStatus, RestoreOutcome, RestoreSource } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { flushAll } from '../../state/flush';
import { pluralise } from './status';

export interface RestoreTarget {
  source: RestoreSource;
  /** What is being restored, e.g. "Backup from 22 November 2026 at 10:00". */
  label: string;
}

export interface RestoreDialogProps {
  target: RestoreTarget | null;
  /** Used to say whether a safety backup of the current journal can be made first. */
  status: BackupStatus | null;
  onClose(): void;
  onRestored(outcome: RestoreOutcome): void;
}

export const JOURNAL_UNCHANGED = 'Your current journal is unchanged.';

/** The journal's message, followed by the reassurance when it does not already give it. */
export function restoreFailureMessage(message: string): string {
  return /unchanged/i.test(message) ? message : `${message} ${JOURNAL_UNCHANGED}`;
}

export function restoredNotice(outcome: RestoreOutcome): string {
  const restored = `Backup restored: ${pluralise(outcome.entries, 'entry', 'entries')} in your journal.`;
  return outcome.safetyBackup ? `${restored} A safety backup of your previous journal was made first.` : restored;
}

export function RestoreDialog({ target, ...props }: RestoreDialogProps) {
  return target ? <OpenRestoreDialog target={target} {...props} /> : null;
}

function OpenRestoreDialog({ target, status, onClose, onRestored }: RestoreDialogProps & { target: RestoreTarget }) {
  const api = useApi();
  const formId = useId();
  const passphraseRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const safetyBackupPossible = Boolean(status?.folderPath && status.passphraseAvailable);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (passphrase === '') {
      setFieldError('Enter the passphrase this backup was made with.');
      passphraseRef.current?.focus();
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      // Pending edits are saved first, so they are part of the safety backup.
      await flushAll();
      const outcome = await api.restoreBackup(target.source, passphrase);
      setPassphrase('');
      onRestored(outcome);
    } catch (caught) {
      setPassphrase('');
      setError(restoreFailureMessage(toCommandError(caught).message));
      setBusy(false);
      passphraseRef.current?.focus();
    }
  }

  return (
    <Dialog
      open
      role="alertdialog"
      title="Restore this backup?"
      onClose={() => {
        if (!busy) onClose();
      }}
      initialFocus={passphraseRef}
      description={
        <>
          <p className="restore-dialog__source">{target.label}</p>
          <p>
            Restoring replaces the journal on this Mac (entries, trash and display preferences) with the content of this
            backup. Backup settings on this Mac stay as they are.
          </p>
          <p>
            {safetyBackupPossible
              ? 'If your current journal has entries, a safety backup of it is made in your backup folder first.'
              : 'A safety backup of your current journal can’t be made first, because no backup folder is chosen or the backup passphrase hasn’t been entered in this session.'}
          </p>
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form={formId} busy={busy}>
            {busy ? 'Restoring…' : 'Replace journal and restore'}
          </Button>
        </>
      }
    >
      <form id={formId} className="dialog-form" noValidate onSubmit={(event) => void submit(event)}>
        <TextField
          ref={passphraseRef}
          label="Passphrase for this backup"
          type="password"
          hint="The passphrase in use when this backup was made. It may differ from your current one."
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={passphrase}
          error={fieldError}
          onChange={(event) => setPassphrase(event.currentTarget.value)}
        />
        {error ? (
          <Notice tone="error" title="The backup was not restored">
            {error}
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}

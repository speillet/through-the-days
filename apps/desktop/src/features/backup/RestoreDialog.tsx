// Restores one backup after asking for the passphrase it was made with. The journal
// verifies the backup before replacing anything, so every failure leaves the current
// journal as it was; the dialog says so and names the cause. When the current journal
// cannot be read, no safety backup of it can be made, and restoring then needs an
// explicit confirmation; any other failed safety backup cancels the restore. Only a
// backup that could not be decrypted or validated empties the passphrase field.
// Opened from the startup screen, there is no open journal: the one that can't be
// opened is kept aside in the data folder and a new journal is made from the backup.

import { useId, useRef, useState, type FormEvent } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupStatus, CommandError, ErrorCode, RestoreOutcome, RestoreSource } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { pluralise } from '../../domain/copy';
import { flushAll, hasPending } from '../../state/flush';

export interface RestoreTarget {
  source: RestoreSource;
  /** What is being restored, e.g. "Backup from 22 November 2026 at 10:00". */
  label: string;
}

interface RestoreDialogProps {
  target: RestoreTarget | null;
  /** Used to say whether a safety backup of the current journal can be made first. */
  status: BackupStatus | null;
  /** "startup": no journal is open, so the unreadable one is kept aside instead of backed up. */
  context?: 'settings' | 'startup';
  onClose(): void;
  onRestored(outcome: RestoreOutcome): void;
}

const JOURNAL_UNCHANGED = 'Your current journal is unchanged.';

export const UNSAVED_WRITING_NOT_RESTORED =
  'Some writing hasn’t been saved yet, so the backup was not restored. Wait until it shows Saved, then try again.';

/** Failures of the safety backup that is published before the journal is replaced. */
const SAFETY_BACKUP_FAILURES: ReadonlySet<ErrorCode> = new Set(['backup', 'backupValidation', 'backupRegistry', 'backupFolder']);

/** The journal's message, saying what stopped the restore, and the reassurance when it is not already given. */
export function restoreFailureMessage(error: CommandError): string {
  const message = SAFETY_BACKUP_FAILURES.has(error.code)
    ? `A safety backup of your current journal could not be made first, so nothing was restored. ${error.message}`
    : error.message;
  return /unchanged/i.test(message) ? message : `${message} ${JOURNAL_UNCHANGED}`;
}

export function restoredNotice(outcome: RestoreOutcome): string {
  const parts = [`Backup restored: ${pluralise(outcome.entries, 'entry', 'entries')} in your journal.`];
  if (outcome.safetyBackup) parts.push('A safety backup of your previous journal was made first.');
  if (outcome.setAside) {
    parts.push(`The journal that could not be opened was kept in the app’s data folder as ${outcome.setAside}.`);
  }
  return parts.join(' ');
}

export function RestoreDialog({ target, ...props }: RestoreDialogProps) {
  return target ? <OpenRestoreDialog target={target} {...props} /> : null;
}

function OpenRestoreDialog({
  target,
  status,
  context = 'settings',
  onClose,
  onRestored,
}: RestoreDialogProps & { target: RestoreTarget }) {
  const api = useApi();
  const formId = useId();
  const passphraseRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The backup was verified but no safety backup of the current journal can be made. */
  const [confirmWithout, setConfirmWithout] = useState(false);
  const safetyBackupPossible = Boolean(status?.folderPath && status.passphraseAvailable);

  async function restore(withoutSafetyBackup: boolean) {
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
      // Pending edits are saved first, so they are part of the safety backup; a save
      // still waiting could otherwise land in the restored journal.
      await flushAll();
      if (hasPending()) {
        setError(UNSAVED_WRITING_NOT_RESTORED);
        setBusy(false);
        return;
      }
      const outcome = await api.restoreBackup(target.source, passphrase, withoutSafetyBackup);
      setPassphrase('');
      onRestored(outcome);
    } catch (caught) {
      const failure = toCommandError(caught);
      setError(restoreFailureMessage(failure));
      setBusy(false);
      // Only an unreadable current journal can be replaced without a safety backup.
      setConfirmWithout(failure.code === 'safetyBackupFailed' && !withoutSafetyBackup);
      // Only a backup that could not be decrypted or validated puts the passphrase in doubt.
      // After any other failure, such as a disconnected drive, it stays for another try.
      if (failure.code === 'restore') {
        setPassphrase('');
        passphraseRef.current?.focus();
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void restore(confirmWithout);
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
          {context === 'startup' ? (
            <p>
              Restoring makes a new journal on this Mac from this backup, with its entries, trash and display
              preferences. The journal that can’t be opened is kept aside in the app’s data folder; it is not deleted.
            </p>
          ) : (
            <>
              <p>
                Restoring replaces the journal on this Mac (entries, trash and display preferences) with the content of
                this backup. Backup settings on this Mac stay as they are.
              </p>
              <p>
                {safetyBackupPossible
                  ? 'If your current journal has entries, a safety backup of it is made in your backup folder first.'
                  : 'A safety backup of your current journal can’t be made first, because no backup folder is chosen or the backup passphrase hasn’t been entered in this session.'}
              </p>
            </>
          )}
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form={formId} busy={busy}>
            {busy ? 'Restoring…' : confirmWithout ? 'Restore without a safety backup' : 'Replace journal and restore'}
          </Button>
        </>
      }
    >
      <form id={formId} className="dialog-form" noValidate onSubmit={submit}>
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
        {confirmWithout ? (
          <Notice tone="warning" title="Restore without a safety backup?" politeness="off">
            Your current journal is replaced without a copy of it being kept, so anything in it that this backup
            doesn’t contain is lost. Choose this only if your current journal is damaged.
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}

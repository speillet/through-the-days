// Erases everything the app keeps on this Mac after a typed ERASE confirmation,
// then reopens a fresh journal. Backup files in the chosen folder, and copies made by
// other software such as Time Machine, are not the app's to delete; the scope and
// those limits are stated before anything happens. The startup screen offers the
// same dialog when the journal can't be opened.

import { useId, useRef, useState, type FormEvent } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { CommandError, StartupStatus } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice, type NoticeTone } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { flushAll, hasPending } from '../../state/flush';
import { useNavigation } from '../../state/navigation';
import { useStartup } from '../../state/startup';
import '../backup/backup.css';

export const ERASE_CONFIRMATION = 'ERASE';

export const ERASED_NOTICE =
  'All app data on this Mac was erased. Backup files in your backup folder were not deleted.';

export const UNSAVED_WRITING_NOT_ERASED =
  'Some writing hasn’t been saved yet, so nothing was erased. Wait until it shows Saved, then try again.';

/** The warning shown in the reopened workspace when erasing stopped part of the way. */
export function incompleteErasureNotice(error: CommandError): string {
  if (error.code === 'keychain') {
    return 'Your journal and backup settings on this Mac were erased, but the backup passphrase could not be removed from macOS Keychain. You can delete it yourself in the Keychain Access app: search for “throughthedays”. Backup files in your backup folder were not deleted.';
  }
  return 'Erasing did not finish, so some app data may still be on this Mac. The app reopened the journal as it is now: check what is left, then try erasing again.';
}

function EraseScope() {
  return (
    <ul className="settings-list">
      <li>every journal entry, with its writing and check-in answers</li>
      <li>the trash</li>
      <li>your display preferences</li>
      <li>the backup settings on this Mac: the chosen folder and the backup history</li>
      <li>the backup passphrase, including the copy remembered in macOS Keychain</li>
    </ul>
  );
}

const BACKUP_FILES_KEPT =
  'Backup files in your backup folder are not deleted. Delete them yourself in Finder if you no longer want them: anyone with a backup file and its passphrase can restore it.';

export const OTHER_COPIES_KEPT =
  'Copies made outside the app are not removed either. Time Machine backups of this Mac, including its local snapshots, contain your journal unencrypted unless the backup disk is encrypted. If iCloud Drive or another service syncs your backup folder, it keeps its own copies of the encrypted backups.';

export function EraseSection() {
  const { setStatus } = useStartup();
  const { navigate } = useNavigation();
  const [open, setOpen] = useState(false);
  return (
    <div className="settings-stack">
      <p className="settings-text">
        Erase everything Through the Days keeps on this Mac and start again with an empty journal. This erases:
      </p>
      <EraseScope />
      <p className="settings-note">{BACKUP_FILES_KEPT}</p>
      <p className="settings-note">{OTHER_COPIES_KEPT}</p>
      <p className="settings-text">
        This version keeps no generated summaries, indexes or other data derived from your writing. Erasing is not
        forensic: traces can remain on the disk until macOS overwrites them.
      </p>
      <div className="settings-actions">
        <Button variant="danger" onClick={() => setOpen(true)}>
          Erase all app data…
        </Button>
      </div>
      <EraseDialog
        open={open}
        onClose={() => setOpen(false)}
        onErased={(next, notice, tone) => {
          setOpen(false);
          navigate('today');
          setStatus(next, notice, tone);
        }}
      />
    </div>
  );
}

export interface EraseDialogProps {
  open: boolean;
  onClose(): void;
  /**
   * Receives the journal's status once erasing ran, with the notice to show in the
   * reopened workspace: a confirmation, or a warning when erasing stopped part of the way.
   */
  onErased(next: StartupStatus, notice: string, tone: NoticeTone): void;
}

export function EraseDialog({ open, ...props }: EraseDialogProps) {
  return open ? <OpenEraseDialog {...props} /> : null;
}

function OpenEraseDialog({ onClose, onErased }: Omit<EraseDialogProps, 'open'>) {
  const api = useApi();
  const formId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (typed !== ERASE_CONFIRMATION) {
      setFieldError('Type ERASE in capital letters to confirm.');
      fieldRef.current?.focus();
      return;
    }
    setFieldError(null);
    setBusy(true);
    // A save still in flight must not land in the fresh journal.
    await flushAll();
    if (hasPending()) {
      setError(UNSAVED_WRITING_NOT_ERASED);
      setBusy(false);
      return;
    }
    try {
      const next = await api.eraseAppData(typed);
      onErased(next, ERASED_NOTICE, 'success');
    } catch (caught) {
      const failure = toCommandError(caught);
      if (failure.code === 'confirmation') {
        setFieldError(failure.message);
        setBusy(false);
        return;
      }
      // Erasing may have stopped part of the way, after the journal itself was erased:
      // reopen every view on whatever journal is open now, and say what remains.
      let next: StartupStatus | null = null;
      try {
        next = await api.startupStatus();
      } catch {
        next = null;
      }
      if (next?.state === 'ready') {
        onErased(next, incompleteErasureNotice(failure), 'warning');
      } else {
        setError(failure.message);
        setBusy(false);
      }
    }
  }

  return (
    <Dialog
      open
      role="alertdialog"
      title="Erase all app data?"
      onClose={() => {
        if (!busy) onClose();
      }}
      initialFocus={fieldRef}
      description={
        <>
          <p>This permanently erases, on this Mac:</p>
          <EraseScope />
          <p>{BACKUP_FILES_KEPT}</p>
          <p>{OTHER_COPIES_KEPT}</p>
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form={formId} busy={busy}>
            {busy ? 'Erasing…' : 'Erase all app data'}
          </Button>
        </>
      }
    >
      <form id={formId} className="dialog-form" noValidate onSubmit={(event) => void submit(event)}>
        <TextField
          ref={fieldRef}
          label="Type ERASE to confirm"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={typed}
          error={fieldError}
          onChange={(event) => setTyped(event.currentTarget.value)}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
      </form>
    </Dialog>
  );
}

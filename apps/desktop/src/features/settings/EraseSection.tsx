// Erases everything the app keeps on this Mac after a typed ERASE confirmation,
// then reopens a fresh journal. Backup files in the chosen folder are not the
// app's to delete; the scope and that limit are stated before anything happens.

import { useId, useRef, useState, type FormEvent } from 'react';
import { toCommandError, useApi } from '../../api/client';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { flushAll } from '../../state/flush';
import { useNavigation } from '../../state/navigation';
import { useStartup } from '../../state/startup';
import '../backup/backup.css';

export const ERASE_CONFIRMATION = 'ERASE';

export const ERASED_NOTICE =
  'All app data on this Mac was erased. Backup files in your backup folder were not deleted.';

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

export function EraseSection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="settings-stack">
      <p className="settings-text">
        Erase everything Through the Days keeps on this Mac and start again with an empty journal. This erases:
      </p>
      <EraseScope />
      <p className="settings-note">{BACKUP_FILES_KEPT}</p>
      <p className="settings-text">
        This version keeps no generated summaries, indexes or other data derived from your writing. Erasing is not
        forensic: traces can remain on the disk until macOS overwrites them.
      </p>
      <div className="settings-actions">
        <Button variant="danger" onClick={() => setOpen(true)}>
          Erase all app data…
        </Button>
      </div>
      <EraseDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function EraseDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return open ? <OpenEraseDialog onClose={onClose} /> : null;
}

function OpenEraseDialog({ onClose }: { onClose(): void }) {
  const api = useApi();
  const { setStatus } = useStartup();
  const { navigate } = useNavigation();
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
    try {
      // A save still in flight must not land in the fresh journal.
      await flushAll();
      const next = await api.eraseAppData(typed);
      navigate('today');
      setStatus(next, ERASED_NOTICE);
    } catch (caught) {
      setError(toCommandError(caught).message);
      setBusy(false);
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

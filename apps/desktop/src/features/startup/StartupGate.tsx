// Shown until the journal is open: while it opens, when an existing journal needs
// a protected upgrade (an encrypted backup first, D-005/D-006), when this version
// cannot open it, or when opening failed. Nothing here changes the journal except
// "Back up and upgrade", which the journal performs only after the backup succeeds.

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupStatus, StartupStatus } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { APP_NAME } from '../../domain/copy';
import { useStartup } from '../../state/startup';
import {
  EMPTY_PASSPHRASE,
  PassphraseFields,
  PassphraseGuidance,
  type PassphraseValues,
} from '../backup/PassphraseFields';
import { hasProblems, newPassphraseProblems, type PassphraseProblems } from '../backup/status';
import './startup.css';

export const UPGRADED_NOTICE = 'Your journal was backed up and upgraded. You can keep writing.';
const NOT_CHANGED = 'Your journal has not been changed.';

export function StartupGate() {
  const { status, error, refresh } = useStartup();
  let content: ReactNode;
  if (error) {
    content = <OpenFailure message={error.message} onRetry={refresh} />;
  } else if (!status) {
    content = (
      <>
        <h1 className="startup__title">{APP_NAME}</h1>
        <p role="status">Opening your journal…</p>
      </>
    );
  } else if (status.state === 'needsMigration') {
    content = <ProtectedUpgrade />;
  } else if (status.state === 'unsupported') {
    content = <Unsupported status={status} />;
  } else {
    content = <OpenFailure message={status.message} dataLocation={status.dataLocation} onRetry={refresh} />;
  }
  return (
    <main className="startup-gate">
      <div className="startup panel">{content}</div>
    </main>
  );
}

function DataLocation({ path }: { path: string }) {
  return (
    <p>
      Your journal is kept in: <span className="startup__path">{path}</span>
    </p>
  );
}

function OpenFailure({
  message,
  dataLocation,
  onRetry,
}: {
  message: string | null;
  dataLocation?: string;
  onRetry(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h1 className="startup__title">The journal could not be opened</h1>
      <Notice tone="error">{message ?? 'Something went wrong while opening the journal.'}</Notice>
      {dataLocation ? <DataLocation path={dataLocation} /> : null}
      <div className="startup__actions">
        <Button
          variant="primary"
          busy={busy}
          onClick={() => {
            setBusy(true);
            void onRetry().finally(() => setBusy(false));
          }}
        >
          Try again
        </Button>
      </div>
    </>
  );
}

function Unsupported({ status }: { status: StartupStatus }) {
  return (
    <>
      <h1 className="startup__title">This journal can’t be opened</h1>
      <Notice tone="warning" politeness="off">
        {status.message ??
          'This journal was created by a newer version of Through the Days or is not a journal database. It has not been changed.'}
      </Notice>
      <p>If a newer version of Through the Days made this journal, install that version to open it.</p>
      <DataLocation path={status.dataLocation} />
    </>
  );
}

function ProtectedUpgrade() {
  const api = useApi();
  const { setStatus } = useStartup();
  const formId = useId();
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [values, setValues] = useState<PassphraseValues>(EMPTY_PASSPHRASE);
  const [problems, setProblems] = useState<PassphraseProblems>({});
  const [folderError, setFolderError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'folder' | 'upgrade' | null>(null);

  useEffect(() => {
    let active = true;
    api.backupStatus().then(
      (next) => {
        if (active) setBackup(next);
      },
      () => {
        // Without a status the folder step simply offers to choose one.
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  const folderChosen = Boolean(backup?.folderPath);

  async function chooseFolder() {
    if (busy) return;
    setBusy('folder');
    setFolderError(null);
    try {
      setBackup(await api.chooseBackupFolder());
    } catch (caught) {
      setFolderError(toCommandError(caught).message);
    } finally {
      setBusy(null);
    }
  }

  async function upgrade(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!folderChosen) {
      setFolderError('Choose a backup folder first.');
      return;
    }
    const found = newPassphraseProblems(values.passphrase, values.confirmation);
    setProblems(found);
    if (hasProblems(found)) return;
    setBusy('upgrade');
    try {
      const next = await api.migrateJournal(values.passphrase, values.remember);
      setValues(EMPTY_PASSPHRASE);
      setStatus(next, next.state === 'ready' ? UPGRADED_NOTICE : undefined);
    } catch (caught) {
      setError(`${toCommandError(caught).message} ${NOT_CHANGED}`);
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className="startup__title">Protect your journal before upgrading</h1>
      <p>
        This version of Through the Days stores journals in a newer format. Before your journal is upgraded, the app
        makes an encrypted backup of it, so you can return to it if anything goes wrong. Nothing has been changed yet.
      </p>

      <form id={formId} className="startup__form" noValidate onSubmit={(event) => void upgrade(event)}>
        <div className="startup__step">
          <h2 className="startup__step-title">1. Backup folder</h2>
          {folderChosen && backup ? (
            <p>
              The backup will be saved in {backup.folderName} <span className="startup__path">{backup.folderPath}</span>
            </p>
          ) : (
            <p>Choose a folder on this Mac or on an external drive for encrypted backups.</p>
          )}
          <div className="startup__actions">
            <Button busy={busy === 'folder'} onClick={() => void chooseFolder()}>
              {folderChosen ? 'Change folder…' : 'Choose backup folder…'}
            </Button>
          </div>
          {folderError ? <Notice tone="error">{folderError}</Notice> : null}
        </div>

        <div className="startup__step">
          <h2 className="startup__step-title">2. Backup passphrase</h2>
          <PassphraseGuidance />
          <PassphraseFields values={values} onChange={setValues} problems={problems} />
        </div>

        {busy === 'upgrade' ? (
          <Notice tone="info">Backing up and upgrading your journal. This can take a few seconds…</Notice>
        ) : null}
        {error ? (
          <Notice tone="error" title="The journal was not upgraded">
            {error}
          </Notice>
        ) : null}
        <div className="startup__actions">
          <Button variant="primary" type="submit" busy={busy === 'upgrade'}>
            Back up and upgrade
          </Button>
        </div>
      </form>
    </>
  );
}

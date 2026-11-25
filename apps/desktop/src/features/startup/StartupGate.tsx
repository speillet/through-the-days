// Shown until the journal is open: while it opens (saying so when it waits for an
// answer to a macOS Keychain prompt), when an existing journal needs a protected
// upgrade (an encrypted backup first, D-005/D-006), when this version cannot open it,
// or when opening failed. A journal that can't be opened can be opened again,
// restored from a backup file (the file that can't be opened is kept aside, never
// deleted) or erased after a typed confirmation. An older journal whose upgrade failed
// can be restored or erased in the same way. Otherwise nothing here changes the journal except "Back up and upgrade", which the journal performs only after the
// backup succeeds.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupStatus, RestoreOutcome, StartupStatus } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { APP_NAME } from '../../domain/copy';
import { useStartup } from '../../state/startup';
import {
  EMPTY_PASSPHRASE,
  focusFirstProblem,
  PassphraseFields,
  PassphraseGuidance,
  type PassphraseValues,
} from '../backup/PassphraseFields';
import { RestoreDialog, restoredNotice, type RestoreTarget } from '../backup/RestoreDialog';
import {
  hasProblems,
  KEYCHAIN_PENDING_TEXT,
  newPassphraseProblems,
  type PassphraseProblems,
} from '../backup/status';
import { EraseDialog } from '../settings/EraseSection';
import './startup.css';

export const UPGRADED_NOTICE = 'Your journal was backed up and upgraded. You can keep writing.';
export const STILL_NOT_OPEN = 'The journal still could not be opened.';
const NOT_CHANGED = 'Your journal has not been changed.';
/** How long the journal may take to open before the screen checks whether it waits for Keychain. */
export const KEYCHAIN_HINT_DELAY_MS = 3_000;

export function StartupGate() {
  const { status, error, refresh } = useStartup();
  let content: ReactNode;
  if (error) {
    content = <StatusUnavailable message={error.message} onRetry={refresh} />;
  } else if (!status) {
    content = <Opening />;
  } else if (status.state === 'needsMigration') {
    content = <ProtectedUpgrade status={status} />;
  } else if (status.state === 'unsupported') {
    content = <Unsupported status={status} />;
  } else {
    content = <OpenFailure status={status} />;
  }
  return (
    <main className="startup-gate">
      <div className="startup panel">{content}</div>
    </main>
  );
}

/**
 * The journal is opening. An older journal waits for the passphrase remembered in Keychain to
 * upgrade it, and the Keychain prompt can open behind the window: after a few seconds, say so.
 *
 * Once the prompt is answered, the launch backs up and upgrades the journal while holding it,
 * and the backup status waits for it as well; asking again could not show that the prompt was
 * answered before the journal opens. So the hint also says what follows the answer.
 */
function Opening() {
  const api = useApi();
  const [waitingForKeychain, setWaitingForKeychain] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      api.backupStatus().then(
        (backup) => {
          if (active) setWaitingForKeychain(backup.keychainPending);
        },
        () => {
          // Without a backup status the screen simply keeps waiting for the journal.
        },
      );
    }, KEYCHAIN_HINT_DELAY_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api]);

  return (
    <>
      <h1 className="startup__title">{APP_NAME}</h1>
      <p role="status">Opening your journal…</p>
      {waitingForKeychain ? (
        <Notice tone="info">
          {KEYCHAIN_PENDING_TEXT} After you answer it, the app may take a few more seconds to back up and upgrade your
          journal.
        </Notice>
      ) : null}
    </>
  );
}

function DataLocation({ path }: { path: string }) {
  return (
    <p>
      Your journal is kept in: <span className="startup__path">{path}</span>
    </p>
  );
}

/** The startup status itself could not be read: reading it again is all there is to do. */
function StatusUnavailable({ message, onRetry }: { message: string; onRetry(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h1 className="startup__title">The journal could not be opened</h1>
      <Notice tone="error">{message}</Notice>
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

function OpenFailure({ status }: { status: StartupStatus }) {
  const api = useApi();
  const { setStatus } = useStartup();
  const [busy, setBusy] = useState(false);
  const [retryNote, setRetryNote] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setRetryNote(null);
    try {
      // Opens the journal again: the cause, such as another app holding the file, may have gone.
      const next = await api.retryStartup();
      if (next.state === 'failed') setRetryNote({ tone: 'info', text: STILL_NOT_OPEN });
      setStatus(next);
    } catch (caught) {
      setRetryNote({ tone: 'error', text: toCommandError(caught).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="startup__title">The journal could not be opened</h1>
      <Notice tone="error">{status.message ?? 'Something went wrong while opening the journal.'}</Notice>
      <DataLocation path={status.dataLocation} />
      <div className="startup__actions">
        <Button variant="primary" busy={busy} onClick={() => void retry()}>
          Try again
        </Button>
      </div>
      {retryNote ? <Notice tone={retryNote.tone}>{retryNote.text}</Notice> : null}
      <Recovery status={status}>
        <p>
          If the journal file is damaged, restore your journal from a backup file. The journal that can’t be opened is
          kept aside in the app’s data folder; it is not deleted. You can also erase all app data on this Mac and start
          again with an empty journal.
        </p>
      </Recovery>
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
      <Recovery status={status}>
        <p>
          If the journal file is damaged or is not a Through the Days journal, you can restore your journal from a
          backup file instead. The file that can’t be opened is kept aside in the app’s data folder; it is not deleted.
          You can also erase all app data on this Mac and start again with an empty journal.
        </p>
      </Recovery>
    </>
  );
}

/** Ways back when the journal can't be opened or upgraded: a backup file, or erasing app data. */
function Recovery({ status, children }: { status: StartupStatus; children: ReactNode }) {
  const api = useApi();
  const { setStatus } = useStartup();
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [target, setTarget] = useState<RestoreTarget | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);

  async function chooseFile() {
    if (picking) return;
    setPicking(true);
    setPickError(null);
    try {
      const picked = await api.chooseRestoreFile();
      if (picked) setTarget({ source: { kind: 'picked' }, label: `Backup file: ${picked.name}` });
    } catch (caught) {
      setPickError(toCommandError(caught).message);
    } finally {
      setPicking(false);
    }
  }

  async function restored(outcome: RestoreOutcome) {
    setTarget(null);
    let next: StartupStatus;
    try {
      next = await api.startupStatus();
    } catch {
      // The restore opened a new journal even if its status can't be read back.
      next = { ...status, state: 'ready', fromVersion: null, message: null };
    }
    setStatus(next, restoredNotice(outcome));
  }

  return (
    <div className="startup__step startup__recovery">
      <h2 className="startup__step-title">Get your journal back</h2>
      {children}
      <div className="startup__actions">
        <Button busy={picking} onClick={() => void chooseFile()}>
          Restore from a backup file…
        </Button>
        <Button variant="danger" onClick={() => setEraseOpen(true)}>
          Erase app data…
        </Button>
      </div>
      {pickError ? <Notice tone="error">{pickError}</Notice> : null}
      <RestoreDialog
        target={target}
        status={null}
        context="startup"
        onClose={() => setTarget(null)}
        onRestored={(outcome) => void restored(outcome)}
      />
      <EraseDialog
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        onErased={(next, notice, tone) => {
          setEraseOpen(false);
          setStatus(next, notice, tone);
        }}
      />
    </div>
  );
}

function ProtectedUpgrade({ status }: { status: StartupStatus }) {
  const api = useApi();
  const { setStatus } = useStartup();
  const formId = useId();
  const passphraseRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [values, setValues] = useState<PassphraseValues>(EMPTY_PASSPHRASE);
  const [problems, setProblems] = useState<PassphraseProblems>({});
  const [folderError, setFolderError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set once an upgrade from this screen fails, so the ways back stay offered during later attempts. */
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [busy, setBusy] = useState<'folder' | 'upgrade' | 'session' | null>(null);

  useEffect(() => {
    let active = true;
    api.backupStatus().then(
      (next) => {
        if (!active) return;
        setBackup(next);
        // A passphrase remembered in Keychain stays remembered unless the person unticks the box.
        setValues((current) => ({ ...current, remember: next.remembered }));
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
  const sessionPassphrase = Boolean(backup?.passphraseAvailable);

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

  async function migrate(kind: 'upgrade' | 'session', passphrase: string | null, remember: boolean) {
    setBusy(kind);
    try {
      const next = await api.migrateJournal(passphrase, remember);
      setValues(EMPTY_PASSPHRASE);
      setStatus(next, next.state === 'ready' ? UPGRADED_NOTICE : undefined);
    } catch (caught) {
      setError(`${toCommandError(caught).message} ${NOT_CHANGED}`);
      setAttemptFailed(true);
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
    if (hasProblems(found)) {
      focusFirstProblem(found, passphraseRef, confirmationRef);
      return;
    }
    await migrate('upgrade', values.passphrase, values.remember);
  }

  async function upgradeWithSessionPassphrase() {
    if (busy) return;
    setError(null);
    if (!folderChosen) {
      setFolderError('Choose a backup folder first.');
      return;
    }
    // The passphrase already in this session; a remembered one stays remembered.
    await migrate('session', null, backup?.remembered ?? false);
  }

  return (
    <>
      <h1 className="startup__title">Protect your journal before upgrading</h1>
      <p>
        This version of Through the Days stores journals in a newer format. Before your journal is upgraded, the app
        makes an encrypted backup of it, so you can return to it if anything goes wrong. Nothing has been changed yet.
      </p>
      {status.message ? (
        <Notice tone="warning" title="The automatic upgrade could not run">
          {status.message}
        </Notice>
      ) : null}

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
          {sessionPassphrase ? (
            <>
              <p>
                {backup?.remembered
                  ? 'Your backup passphrase is remembered in macOS Keychain. You can back up and upgrade with it, or enter a different passphrase below.'
                  : 'Your backup passphrase was entered in this session. You can back up and upgrade with it, or enter a different passphrase below.'}
              </p>
              <div className="startup__actions">
                <Button
                  variant="primary"
                  busy={busy === 'session'}
                  onClick={() => void upgradeWithSessionPassphrase()}
                >
                  Back up and upgrade with this passphrase
                </Button>
              </div>
            </>
          ) : null}
          <PassphraseGuidance />
          <PassphraseFields
            values={values}
            onChange={setValues}
            problems={problems}
            passphraseRef={passphraseRef}
            confirmationRef={confirmationRef}
          />
        </div>

        {busy === 'upgrade' || busy === 'session' ? (
          <Notice tone="info">Backing up and upgrading your journal. This can take a few seconds…</Notice>
        ) : null}
        {error ? (
          <Notice tone="error" title="The journal was not upgraded">
            {error}
          </Notice>
        ) : null}
        <div className="startup__actions">
          <Button variant={sessionPassphrase ? 'secondary' : 'primary'} type="submit" busy={busy === 'upgrade'}>
            Back up and upgrade
          </Button>
        </div>
      </form>

      {/* Damage in the journal itself can stop every backup of it, so a failed upgrade offers the ways back. */}
      {attemptFailed || status.message ? (
        <>
          <DataLocation path={status.dataLocation} />
          <Recovery status={status}>
            <p>
              If the upgrade keeps failing, for example because the journal file is damaged, you can restore your
              journal from a backup file instead. The journal that can’t be upgraded is kept aside in the app’s data
              folder; it is not deleted. You can also erase all app data on this Mac and start again with an empty
              journal.
            </p>
          </Recovery>
        </>
      ) : null}
    </>
  );
}

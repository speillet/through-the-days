// The backup banner in the status area of every view. Gentle view never hides it.
// It asks for what a due backup needs (a folder or the passphrase), says when it
// still waits for macOS Keychain, reports a failed backup with what to do next, says
// when the backup settings of this Mac could not be read, and confirms a backup only
// after the journal reports it. A passphrase request, unreadable settings or a
// failure cannot be dismissed; in focus mode only those, and the outcome of a
// passphrase just entered, stay visible.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupStatus } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { useBackup } from '../../state/backup';
import { useFocusMode } from '../../state/focus';
import { useNavigation } from '../../state/navigation';
import { PassphraseDialog } from './PassphraseDialog';
import { KEYCHAIN_PENDING_TEXT, passphraseSavedWarning, RETENTION_WARNING, SETTINGS_UNREADABLE_TEXT } from './status';
import './backup.css';

type Phase = 'idle' | 'backingUp' | 'done';

export function BackupBanner() {
  const api = useApi();
  const { status, error, refresh, setStatus, runMaintenance } = useBackup();
  const { navigate } = useNavigation();
  const { focusMode } = useFocusMode();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [retryError, setRetryError] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [setupPostponed, setSetupPostponed] = useState(false);
  const [retentionDismissed, setRetentionDismissed] = useState(false);
  /** What macOS Keychain or the backup settings of this Mac did not keep of the passphrase entered. */
  const [keychainNotice, setKeychainNotice] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusBanner = useRef(false);

  // After the passphrase dialog closes, its opener is gone: keep focus in the banner.
  useEffect(() => {
    if (!focusBanner.current) return;
    focusBanner.current = false;
    rootRef.current?.focus();
  });

  // A confirmation belongs to the backup that was just made, not to a later day.
  useEffect(() => {
    if (phase === 'done' && status?.state !== 'upToDate') setPhase('idle');
  }, [phase, status?.state]);

  /** Runs the due backup and reports what the journal says happened. */
  async function backUpAfterPassphrase(next: BackupStatus) {
    setStatus(next);
    setPhase('backingUp');
    try {
      await runMaintenance();
      let latest = await api.backupStatus();
      // A routine run that began before the passphrase arrived could not back up yet.
      if (latest.state === 'due') {
        await runMaintenance();
        latest = await api.backupStatus();
      }
      setStatus(latest);
      setPhase(latest.state === 'upToDate' ? 'done' : 'idle');
    } catch {
      await refresh();
      setPhase('idle');
    }
  }

  async function tryAgain() {
    setRetryError(null);
    setPhase('backingUp');
    try {
      setStatus(await api.backupNow());
      setPhase('done');
    } catch (caught) {
      setRetryError(toCommandError(caught).message);
      await refresh();
      setPhase('idle');
    }
  }

  /** A folder the backups can't use: choose another one, then make the due backup there. */
  async function chooseAnotherFolder() {
    if (choosingFolder) return;
    setFolderError(null);
    setChoosingFolder(true);
    try {
      const next = await api.chooseBackupFolder();
      setChoosingFolder(false);
      if (next.state === 'due') await backUpAfterPassphrase(next);
      else setStatus(next);
    } catch (caught) {
      setFolderError(toCommandError(caught).message);
      setChoosingFolder(false);
    }
  }

  function openSettings() {
    navigate('settings', { section: 'backups' });
  }

  const notices: ReactElement[] = [];

  if (phase === 'backingUp') {
    notices.push(
      <Notice key="progress" tone="info">
        Backing up your journal…
      </Notice>,
    );
  } else if (phase === 'done' && status?.state === 'upToDate') {
    notices.push(
      <Notice
        key="done"
        tone="success"
        actions={
          <Button variant="quiet" size="small" onClick={() => setPhase('idle')}>
            Dismiss
          </Button>
        }
      >
        Today’s backup is done.
      </Notice>,
    );
  } else if (status?.state === 'needsPassphrase') {
    notices.push(
      <Notice
        key="passphrase"
        tone="warning"
        title="A backup is due"
        actions={
          <Button variant="primary" size="small" onClick={() => setDialogOpen(true)}>
            Enter passphrase
          </Button>
        }
      >
        {status.keychainPending
          ? `${KEYCHAIN_PENDING_TEXT} You can also enter the passphrase yourself, and keep writing in the meantime.`
          : 'Enter your backup passphrase to make today’s encrypted backup. You can keep writing in the meantime.'}
      </Notice>,
    );
  } else if (status?.state === 'settingsUnreadable') {
    notices.push(
      <Notice
        key="settings"
        tone="warning"
        title="Backup settings could not be read"
        actions={
          focusMode ? null : (
            <Button variant="primary" size="small" onClick={openSettings}>
              Backup settings
            </Button>
          )
        }
      >
        {SETTINGS_UNREADABLE_TEXT}
      </Notice>,
    );
  } else if (status?.state === 'failed') {
    const code = status.lastError?.code;
    const message = status.lastError?.message ?? retryError ?? 'The backup could not be created.';
    // A damaged list of backups stays damaged: only another folder helps. An unavailable
    // folder may come back (a drive reconnected), so trying again still makes sense.
    const folderProblem = code === 'backupRegistry' || code === 'backupFolder';
    notices.push(
      <Notice
        key="failed"
        tone="error"
        title="Backup failed"
        actions={
          <>
            {code === 'backupRegistry' ? null : (
              <Button variant="secondary" size="small" onClick={() => void tryAgain()}>
                Try again
              </Button>
            )}
            {folderProblem ? (
              <Button
                variant={code === 'backupRegistry' ? 'secondary' : 'quiet'}
                size="small"
                busy={choosingFolder}
                onClick={() => void chooseAnotherFolder()}
              >
                Choose another folder…
              </Button>
            ) : null}
            {focusMode ? null : (
              <Button variant="quiet" size="small" onClick={openSettings}>
                Backup settings
              </Button>
            )}
          </>
        }
      >
        <p>{message} Earlier backups are not affected.</p>
        {folderError ? <p>The backup folder was not changed. {folderError}</p> : null}
      </Notice>,
    );
  } else if (status?.state === 'needsFolder' && !setupPostponed && !focusMode) {
    notices.push(
      <Notice
        key="setup"
        tone="info"
        title="Set up backups"
        actions={
          <>
            <Button variant="primary" size="small" onClick={openSettings}>
              Set up backups
            </Button>
            <Button variant="quiet" size="small" onClick={() => setSetupPostponed(true)}>
              Not now
            </Button>
          </>
        }
      >
        Your journal isn’t backed up yet. Choose a folder and a passphrase to make an encrypted backup each day.
      </Notice>,
    );
  } else if (!status && error) {
    notices.push(
      <Notice
        key="unreadable"
        tone="error"
        title="Backup status unavailable"
        actions={
          <Button variant="secondary" size="small" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      >
        {error.message}
      </Notice>,
    );
  }

  if (keychainNotice) {
    notices.push(
      <Notice
        key="keychain"
        tone="warning"
        actions={
          <Button variant="quiet" size="small" onClick={() => setKeychainNotice(null)}>
            Dismiss
          </Button>
        }
      >
        {keychainNotice}
      </Notice>,
    );
  }

  if (status?.retentionWarning && !retentionDismissed && !focusMode) {
    notices.push(
      <Notice
        key="retention"
        tone="warning"
        title="Older backups were kept"
        actions={
          <>
            <Button variant="quiet" size="small" onClick={openSettings}>
              Backup settings
            </Button>
            <Button variant="quiet" size="small" onClick={() => setRetentionDismissed(true)}>
              Dismiss
            </Button>
          </>
        }
      >
        {RETENTION_WARNING}
      </Notice>,
    );
  }

  return (
    <>
      {notices.length > 0 ? (
        <div ref={rootRef} className="backup-banner" role="group" aria-label="Backup status" tabIndex={-1}>
          {notices}
        </div>
      ) : null}
      <PassphraseDialog
        open={dialogOpen}
        purpose="due"
        remembered={status?.remembered ?? false}
        onClose={() => setDialogOpen(false)}
        onSaved={(next) => {
          focusBanner.current = true;
          setDialogOpen(false);
          // The passphrase applies to this session even when macOS Keychain or the backup
          // settings did not follow.
          setKeychainNotice(passphraseSavedWarning(next));
          void backUpAfterPassphrase(next);
        }}
      />
    </>
  );
}

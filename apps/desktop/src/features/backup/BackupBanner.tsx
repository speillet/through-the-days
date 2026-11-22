// The backup banner in the status area of every view. Gentle view never hides it.
// It asks for what a due backup needs (a folder or the passphrase), reports a
// failed backup with a way to try again, and confirms a backup only after the
// journal reports it. A passphrase request or a failure cannot be dismissed; in
// focus mode only those stay visible.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupStatus } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { useBackup } from '../../state/backup';
import { useFocusMode } from '../../state/focus';
import { useNavigation } from '../../state/navigation';
import { PassphraseDialog } from './PassphraseDialog';
import { RETENTION_WARNING } from './status';
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
  const [setupPostponed, setSetupPostponed] = useState(false);
  const [retentionDismissed, setRetentionDismissed] = useState(false);
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
        Enter your backup passphrase to make today’s encrypted backup. You can keep writing in the meantime.
      </Notice>,
    );
  } else if (status?.state === 'failed') {
    const message = status.lastError?.message ?? retryError ?? 'The backup could not be created.';
    notices.push(
      <Notice
        key="failed"
        tone="error"
        title="Backup failed"
        actions={
          <>
            <Button variant="secondary" size="small" onClick={() => void tryAgain()}>
              Try again
            </Button>
            {focusMode ? null : (
              <Button variant="quiet" size="small" onClick={openSettings}>
                Backup settings
              </Button>
            )}
          </>
        }
      >
        {message} Earlier backups are not affected.
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
        onClose={() => setDialogOpen(false)}
        onSaved={(next) => {
          focusBanner.current = true;
          setDialogOpen(false);
          void backUpAfterPassphrase(next);
        }}
      />
    </>
  );
}

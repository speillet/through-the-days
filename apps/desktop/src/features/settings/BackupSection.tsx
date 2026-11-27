// Backups: what they do, where they go, the passphrase, status, "Back up now" and
// restore. SettingsView renders the section frame and its h2; this is the body.
// Every status shown comes from the journal; nothing claims success early.

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { BackupRecord, BackupStatus, RestoreOutcome } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice, type NoticeTone } from '../../components/Notice';
import { BACKUPS_KEPT } from '../../domain/backup';
import { formatDateTime } from '../../domain/dates';
import { PassphraseDialog, type PassphrasePurpose } from '../backup/PassphraseDialog';
import { PassphraseGuidance } from '../backup/PassphraseFields';
import { RestoreDialog, restoredNotice, type RestoreTarget } from '../backup/RestoreDialog';
import {
  RETENTION_WARNING,
  SETTINGS_UNREADABLE_TEXT,
  backupStateText,
  formatSize,
  lastBackupText,
  passphraseForgottenWarning,
  passphraseSavedWarning,
  passphraseText,
  pluralise,
} from '../backup/status';
import { useBackup } from '../../state/backup';
import { usePreferences } from '../../state/preferences';
import { useStartup } from '../../state/startup';
import '../backup/backup.css';

/** Backups listed before "Show all". */
const SHORT_LIST = 5;

type Area = 'status' | 'folder' | 'passphrase' | 'restore';
type Busy = 'folder' | 'backup' | 'forget' | 'pick' | null;

interface Feedback {
  area: Area;
  tone: NoticeTone;
  text: string;
}

export function BackupSection() {
  const api = useApi();
  const { status, setStatus, runMaintenance } = useBackup();
  const { timeZone } = usePreferences().preferences;
  const { reloadJournal } = useStartup();
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [passphrasePurpose, setPassphrasePurpose] = useState<PassphrasePurpose | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  /** What macOS Keychain did not do after the last passphrase change, until the next one. */
  const [keychainNotice, setKeychainNotice] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupRecord[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const needsFolderHintId = useId();

  const loadBackups = useCallback(async () => {
    try {
      setBackups(await api.listBackups());
      setListError(null);
    } catch (caught) {
      setListError(toCommandError(caught).message);
    }
  }, [api]);

  // Re-read the list whenever the folder or the set of backups changes.
  const folderPath = status?.folderPath ?? null;
  const backupCount = status?.backupCount ?? 0;
  const lastSuccessAt = status?.lastSuccessAt ?? null;
  useEffect(() => {
    void loadBackups();
  }, [loadBackups, folderPath, backupCount, lastSuccessAt]);

  async function run(kind: Exclude<Busy, null>, area: Area, work: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setFeedback(null);
    try {
      await work();
    } catch (caught) {
      setFeedback({ area, tone: 'error', text: toCommandError(caught).message });
    } finally {
      setBusy(null);
    }
  }

  /** Lets the daily routine make a due backup now that it has what it needs. */
  async function catchUp(next: BackupStatus) {
    setStatus(next);
    if (next.state === 'due') await runMaintenance();
  }

  const chooseFolder = () =>
    run('folder', 'folder', async () => {
      const next = await api.chooseBackupFolder();
      const changed = next.folderPath !== status?.folderPath;
      await catchUp(next);
      if (changed && next.folderName) {
        setFeedback({ area: 'folder', tone: 'success', text: `Backups will be saved in ${next.folderName}.` });
      }
    });

  const backUpNow = () =>
    run('backup', 'status', async () => {
      const next = await api.backupNow();
      setStatus(next);
      const when =
        next.lastSuccessAt === null ? '' : ` Last successful backup: ${formatDateTime(next.lastSuccessAt, timeZone)}.`;
      setFeedback({ area: 'status', tone: 'success', text: `Backup complete.${when}` });
    });

  const forgetPassphrase = () =>
    run('forget', 'passphrase', async () => {
      setKeychainNotice(null);
      const next = await api.forgetBackupPassphrase();
      setStatus(next);
      // Forgotten all the same; Keychain may still hold the passphrase.
      const warning = passphraseForgottenWarning(next.keychainWarning);
      setKeychainNotice(warning);
      if (warning) return;
      setFeedback({
        area: 'passphrase',
        tone: 'success',
        text: 'The passphrase was forgotten on this Mac. The app will ask for it when the next backup is due.',
      });
    });

  const chooseFile = () =>
    run('pick', 'restore', async () => {
      const picked = await api.chooseRestoreFile();
      if (picked) setRestoreTarget({ source: { kind: 'picked' }, label: `Backup file: ${picked.name}` });
    });

  /** The passphrase applies to this session, even when macOS Keychain did not follow. */
  function passphraseSaved(next: BackupStatus, purpose: PassphrasePurpose | null) {
    setPassphrasePurpose(null);
    const warning = passphraseSavedWarning(next.keychainWarning);
    setKeychainNotice(warning);
    if (purpose === 'due') {
      setStatus(next);
      void backUpNow();
      return;
    }
    setFeedback(
      warning
        ? null
        : {
            area: 'passphrase',
            tone: 'success',
            text: next.remembered
              ? 'Passphrase saved and remembered in macOS Keychain.'
              : 'Passphrase saved for this session. The app will ask for it again after it restarts.',
          },
    );
    void catchUp(next);
  }

  function restored(outcome: RestoreOutcome) {
    setRestoreTarget(null);
    // Every view re-reads the replaced journal; the confirmation shows above it.
    reloadJournal(restoredNotice(outcome));
  }

  if (!status) {
    return (
      <p className="settings-text" role="status">
        Reading backup status…
      </p>
    );
  }

  const hasFolder = status.folderPath !== null;
  const hasPassphrase = status.passphraseAvailable || status.remembered;
  const shown = backups && !showAll ? backups.slice(0, SHORT_LIST) : (backups ?? []);
  const feedbackFor = (area: Area): ReactNode =>
    feedback?.area === area ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null;

  return (
    <div className="settings-stack backup-settings">
      <ul className="settings-list">
        <li>Each backup is encrypted with your backup passphrase before it is written to the folder you choose.</li>
        <li>
          While the app is open, it makes one backup a day. If it was closed, it catches up the next time you open it.
        </li>
        <li>
          The {BACKUPS_KEPT} most recent backups are kept. Older ones are removed only after a new backup has succeeded.
        </li>
        <li>
          The app never uploads backups. If you choose a folder that iCloud Drive or another service syncs, that service
          copies the encrypted files.
        </li>
      </ul>

      <div className="backup-group">
        <h3 className="backup-group__title">Status</h3>
        {status.state === 'settingsUnreadable' ? (
          <Notice tone="warning" title="Backup settings could not be read" politeness="off">
            {SETTINGS_UNREADABLE_TEXT}
          </Notice>
        ) : (
          <p>{backupStateText(status)}</p>
        )}
        <dl className="backup-facts">
          <dt>Backup folder</dt>
          <dd>
            {hasFolder ? (
              <>
                {status.folderName} <span className="backup-path">{status.folderPath}</span>
              </>
            ) : (
              'Not chosen yet'
            )}
          </dd>
          <dt>Passphrase</dt>
          <dd>{passphraseText(status)}</dd>
          <dt>Last successful backup</dt>
          <dd>{lastBackupText(status, timeZone)}</dd>
          <dt>Backups kept</dt>
          <dd>
            {status.backupCount} of up to {BACKUPS_KEPT}
          </dd>
        </dl>
        {status.state === 'failed' && status.lastError ? (
          <Notice tone="error" title="The last backup failed">
            {status.lastError.message} Earlier backups are not affected.
          </Notice>
        ) : null}
        {status.retentionWarning ? <Notice tone="warning">{RETENTION_WARNING}</Notice> : null}
        <div className="settings-actions">
          <Button
            variant="primary"
            busy={busy === 'backup'}
            disabled={!hasFolder}
            aria-describedby={hasFolder ? undefined : needsFolderHintId}
            onClick={() => (status.passphraseAvailable ? void backUpNow() : setPassphrasePurpose('due'))}
          >
            {busy === 'backup' ? 'Backing up…' : 'Back up now'}
          </Button>
        </div>
        {hasFolder ? null : (
          <p id={needsFolderHintId} className="field__hint">
            Choose a backup folder first.
          </p>
        )}
        {feedbackFor('status')}
      </div>

      <div className="backup-group">
        <h3 className="backup-group__title">Backup folder</h3>
        <p className="settings-text">
          Choose a folder on this Mac or on an external drive. Changing it later leaves earlier backups where they are.
        </p>
        <div className="settings-actions">
          <Button busy={busy === 'folder'} onClick={() => void chooseFolder()}>
            {hasFolder ? 'Change backup folder…' : 'Choose backup folder…'}
          </Button>
        </div>
        {feedbackFor('folder')}
      </div>

      <div className="backup-group">
        <h3 className="backup-group__title">Backup passphrase</h3>
        <PassphraseGuidance />
        <p className="settings-text">
          If you change it, existing backups keep the passphrase they were made with, and new backups use the new one.
        </p>
        <div className="settings-actions">
          <Button onClick={() => setPassphrasePurpose(hasPassphrase ? 'change' : 'set')}>
            {hasPassphrase ? 'Change passphrase…' : 'Set passphrase…'}
          </Button>
          {hasPassphrase ? (
            <Button variant="quiet" busy={busy === 'forget'} onClick={() => void forgetPassphrase()}>
              Forget passphrase
            </Button>
          ) : null}
        </div>
        {feedbackFor('passphrase')}
        {keychainNotice ? <Notice tone="warning">{keychainNotice}</Notice> : null}
      </div>

      <div className="backup-group">
        <h3 className="backup-group__title">Restore from a backup</h3>
        <p className="settings-text">
          Restoring replaces the journal on this Mac with the content of a backup. You need the passphrase that backup
          was made with. When possible, a safety backup of your current journal is made first.
        </p>
        {listError ? <Notice tone="error">The backups in this folder could not be listed. {listError}</Notice> : null}
        {backups && backups.length > 0 ? (
          <>
            <ul className="backup-list" aria-label="Backups in this folder">
              {shown.map((backup) => {
                const when = formatDateTime(backup.createdAt, timeZone);
                return (
                  <li key={backup.name} className="backup-list__item">
                    <span className="backup-list__when">{when}</span>
                    <span className="backup-list__size">{formatSize(backup.sizeBytes)}</span>
                    <Button
                      size="small"
                      aria-label={`Restore the backup from ${when}…`}
                      onClick={() =>
                        setRestoreTarget({
                          source: { kind: 'registered', name: backup.name },
                          label: `Backup from ${when}`,
                        })
                      }
                    >
                      Restore…
                    </Button>
                  </li>
                );
              })}
            </ul>
            {backups.length > SHORT_LIST ? (
              <Button variant="quiet" size="small" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer backups' : `Show all ${pluralise(backups.length, 'backup')}`}
              </Button>
            ) : null}
          </>
        ) : backups && hasFolder && !listError ? (
          <p className="settings-note">There are no backups in this folder yet.</p>
        ) : null}
        <div className="settings-actions">
          <Button busy={busy === 'pick'} onClick={() => void chooseFile()}>
            Choose a backup file…
          </Button>
        </div>
        {feedbackFor('restore')}
      </div>

      <PassphraseDialog
        open={passphrasePurpose !== null}
        purpose={passphrasePurpose ?? 'set'}
        remembered={status.remembered}
        onClose={() => setPassphrasePurpose(null)}
        onSaved={(next) => passphraseSaved(next, passphrasePurpose)}
      />
      <RestoreDialog
        target={restoreTarget}
        status={status}
        onClose={() => setRestoreTarget(null)}
        onRestored={restored}
      />
    </div>
  );
}

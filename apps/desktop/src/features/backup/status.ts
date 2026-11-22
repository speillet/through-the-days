// English wording for backup status, shared by the banner, Settings and the
// startup gate. Nothing here says a backup succeeded unless the journal reported it.

import type { BackupStatus } from '../../api/types';
import { formatDateTime } from '../../domain/dates';

/** journal-core's rule: at least 12 characters, counted as Unicode scalar values. */
export const PASSPHRASE_MIN_LENGTH = 12;

/** D-009: the 30 latest validated backups are kept. */
export const BACKUPS_KEPT = 30;

export function passphraseLength(passphrase: string): number {
  return Array.from(passphrase).length;
}

export interface PassphraseProblems {
  passphrase?: string;
  confirmation?: string;
}

/** Problems with a new passphrase and its confirmation; empty when both are fine. */
export function newPassphraseProblems(passphrase: string, confirmation: string): PassphraseProblems {
  if (passphraseLength(passphrase) < PASSPHRASE_MIN_LENGTH) {
    return { passphrase: `Use at least ${PASSPHRASE_MIN_LENGTH} characters.` };
  }
  if (confirmation !== passphrase) return { confirmation: 'The two passphrases don’t match.' };
  return {};
}

export function hasProblems(problems: PassphraseProblems): boolean {
  return Boolean(problems.passphrase || problems.confirmation);
}

/** One sentence for the current state, in the order the journal derives it. */
export function backupStateText(status: BackupStatus): string {
  switch (status.state) {
    case 'needsFolder':
      return 'Backups are not set up yet. Choose a backup folder and a passphrase to start.';
    case 'upToDate':
      return 'Today’s backup is done.';
    case 'needsPassphrase':
      return 'A backup is due. Enter your backup passphrase so the app can make it.';
    case 'failed':
      return 'The last backup attempt failed. Earlier backups are not affected.';
    case 'due':
      return 'A backup is due today. It runs automatically while the app is open.';
  }
}

export function passphraseText(status: BackupStatus): string {
  if (status.remembered) return 'Remembered in macOS Keychain on this Mac.';
  if (status.passphraseAvailable) return 'Entered for this session only. You’ll be asked again after the app restarts.';
  return 'Not entered in this session.';
}

export function lastBackupText(status: BackupStatus, timeZone: string): string {
  return status.lastSuccessAt === null ? 'None yet' : formatDateTime(status.lastSuccessAt, timeZone);
}

export const RETENTION_WARNING =
  'Some older backups could not be removed safely, so they were kept. Nothing was deleted. Check the backup folder in Finder, or choose another folder.';

/** "4 KB" for a file size in bytes. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes === 1 ? '1 byte' : `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

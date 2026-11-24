// Native implementation of JournalApi. Argument objects use the camelCase names
// Tauri maps onto the Rust command parameters; the renderer never sends paths.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isCommandError, toCommandError, type JournalApi } from './client';
import type {
  BackupRecord,
  BackupStatus,
  CommandError,
  Entry,
  PickedBackup,
  Preferences,
  RestoreOutcome,
  RestoreSource,
  StartupStatus,
  TrashItem,
  ReadingReport,
  WeeklyReview,
  Milestone,
} from './types';

export const FLUSH_REQUEST_EVENT = 'app://flush-request';

/**
 * A save the native side never received as a command, for example because the webview could
 * not encode the entry. Retrying the same entry fails the same way, so the message asks for
 * the last change to be undone instead of offering a plain retry.
 */
export const ENTRY_NOT_SENT: Readonly<CommandError> = Object.freeze({
  code: 'document',
  message: 'The entry could not be sent to the journal. Undo your last change and try again.',
});

/**
 * Invokes a native command. A rejection that is not a native command error (an invoke or
 * encoding failure) becomes `fallback`, or the generic English message.
 */
async function call<T>(command: string, args?: Record<string, unknown>, fallback?: CommandError): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (fallback && !isCommandError(error)) throw { ...fallback };
    throw toCommandError(error);
  }
}

export function createTauriApi(): JournalApi {
  return {
    startupStatus: () => call<StartupStatus>('startup_status'),
    retryStartup: () => call<StartupStatus>('retry_startup'),
    today: () => call<string>('today'),
    getPreferences: () => call<Preferences>('get_preferences'),
    setPreferences: (preferences) => call<Preferences>('set_preferences', { preferences }),
    entriesOn: (date) => call<Entry[]>('entries_on', { date }),
    listEntries: () => call<Entry[]>('list_entries'),
    searchEntries: (request) => call<Entry[]>('search_entries', { request }),
    readingReport: (request) => call<ReadingReport>('reading_report', { request }),
    weeklyReview: (date) => call<WeeklyReview>('weekly_review', { date }),
    saveWeeklyNotes: (date, notes, revision) =>
      call<WeeklyReview>('save_weekly_notes', { date, notes, revision }),
    generateWeeklySummary: (date) => call<WeeklyReview>('generate_weekly_summary', { date }),
    clearReadingSummaries: async () => {
      await call<null>('clear_reading_summaries');
    },
    listMilestones: () => call<Milestone[]>('list_milestones'),
    saveMilestone: (milestone) => call<Milestone>('save_milestone', { milestone }),
    deleteMilestone: async (id, revision) => {
      await call<null>('delete_milestone', { id, revision });
    },
    getEntry: (id) => call<Entry>('get_entry', { id }),
    saveEntry: (entry) => call<Entry>('save_entry', { entry }, ENTRY_NOT_SENT),
    trashEntry: async (id, revision) => {
      await call<null>('trash_entry', { id, revision });
    },
    listTrash: () => call<TrashItem[]>('list_trash'),
    restoreEntry: (id) => call<Entry>('restore_entry', { id }),
    deleteEntryPermanently: async (id) => {
      await call<null>('delete_entry_permanently', { id });
    },
    purgeExpiredTrash: async () => {
      await call<null>('purge_expired_trash');
    },
    backupStatus: () => call<BackupStatus>('backup_status'),
    chooseBackupFolder: () => call<BackupStatus>('choose_backup_folder'),
    setBackupPassphrase: (passphrase, remember) =>
      call<BackupStatus>('set_backup_passphrase', { passphrase, remember }),
    forgetBackupPassphrase: () => call<BackupStatus>('forget_backup_passphrase'),
    backupNow: () => call<BackupStatus>('backup_now'),
    runDailyBackup: () => call<BackupStatus>('run_daily_backup'),
    listBackups: () => call<BackupRecord[]>('list_backups'),
    chooseRestoreFile: () => call<PickedBackup | null>('choose_restore_file'),
    restoreBackup: (source: RestoreSource, passphrase, withoutSafetyBackup = false) =>
      call<RestoreOutcome>('restore_backup', { source, passphrase, withoutSafetyBackup }),
    migrateJournal: (passphrase, remember) =>
      call<StartupStatus>('migrate_journal', { passphrase, remember }),
    eraseAppData: (confirmation) => call<StartupStatus>('erase_app_data', { confirmation }),
    onFlushRequest(callback) {
      let unlisten: (() => void) | null = null;
      let cancelled = false;
      listen(FLUSH_REQUEST_EVENT, () => {
        Promise.resolve()
          .then(callback)
          .catch(() => {
            // Keep the journal open when a save or flush listener fails.
          });
      }).then(
        (stop) => {
          if (cancelled) stop();
          else unlisten = stop;
        },
        () => {
          // A missing listener must not turn a failed save into a forced quit.
        },
      );
      return () => {
        cancelled = true;
        unlisten?.();
      };
    },
    confirmExit: async () => {
      await call<null>('confirm_exit');
    },
    cancelExit: async () => {
      await call<null>('cancel_exit');
    },
  };
}

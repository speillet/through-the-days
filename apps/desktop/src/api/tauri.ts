// Native implementation of JournalApi. Argument objects use the camelCase names
// Tauri maps onto the Rust command parameters; the renderer never sends paths.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toCommandError, type JournalApi } from './client';
import type {
  BackupRecord,
  BackupStatus,
  Entry,
  PickedBackup,
  Preferences,
  RestoreOutcome,
  RestoreSource,
  StartupStatus,
  TrashItem,
} from './types';

export const FLUSH_REQUEST_EVENT = 'app://flush-request';

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toCommandError(error);
  }
}

export function createTauriApi(): JournalApi {
  return {
    startupStatus: () => call<StartupStatus>('startup_status'),
    today: () => call<string>('today'),
    getPreferences: () => call<Preferences>('get_preferences'),
    setPreferences: (preferences) => call<Preferences>('set_preferences', { preferences }),
    entriesOn: (date) => call<Entry[]>('entries_on', { date }),
    listEntries: () => call<Entry[]>('list_entries'),
    getEntry: (id) => call<Entry>('get_entry', { id }),
    saveEntry: (entry) => call<Entry>('save_entry', { entry }),
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
    restoreBackup: (source: RestoreSource, passphrase) =>
      call<RestoreOutcome>('restore_backup', { source, passphrase }),
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
            // The native fallback still exits after its timeout if flushing failed.
          });
      }).then(
        (stop) => {
          if (cancelled) stop();
          else unlisten = stop;
        },
        () => {
          // Without the listener the native fallback still exits after its timeout.
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
  };
}

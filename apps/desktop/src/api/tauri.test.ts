import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDraft } from '../domain/entry';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import type { JournalApi } from './client';
import { createTauriApi, FLUSH_REQUEST_EVENT } from './tauri';

afterEach(() => {
  clearMocks();
});

function recordCalls(result: (command: string) => unknown = () => null) {
  const calls: Array<[string, unknown]> = [];
  mockIPC((command, payload) => {
    calls.push([command, payload]);
    return result(command);
  });
  return calls;
}

describe('native journal commands', () => {
  it('sends every command with the contract’s argument names', async () => {
    const calls = recordCalls();
    const api = createTauriApi();
    const entry = newDraft('2026-11-22', 'morning', 'Europe/Paris');
    const invocations: Array<[keyof JournalApi, () => Promise<unknown>, string, unknown]> = [
      ['startupStatus', () => api.startupStatus(), 'startup_status', {}],
      ['today', () => api.today(), 'today', {}],
      ['getPreferences', () => api.getPreferences(), 'get_preferences', {}],
      ['setPreferences', () => api.setPreferences(DEFAULT_PREFERENCES), 'set_preferences', { preferences: DEFAULT_PREFERENCES }],
      ['entriesOn', () => api.entriesOn('2026-11-22'), 'entries_on', { date: '2026-11-22' }],
      ['listEntries', () => api.listEntries(), 'list_entries', {}],
      ['getEntry', () => api.getEntry(entry.id), 'get_entry', { id: entry.id }],
      ['saveEntry', () => api.saveEntry(entry), 'save_entry', { entry }],
      ['trashEntry', () => api.trashEntry(entry.id, 3), 'trash_entry', { id: entry.id, revision: 3 }],
      ['listTrash', () => api.listTrash(), 'list_trash', {}],
      ['restoreEntry', () => api.restoreEntry(entry.id), 'restore_entry', { id: entry.id }],
      ['deleteEntryPermanently', () => api.deleteEntryPermanently(entry.id), 'delete_entry_permanently', { id: entry.id }],
      ['purgeExpiredTrash', () => api.purgeExpiredTrash(), 'purge_expired_trash', {}],
      ['backupStatus', () => api.backupStatus(), 'backup_status', {}],
      ['chooseBackupFolder', () => api.chooseBackupFolder(), 'choose_backup_folder', {}],
      [
        'setBackupPassphrase',
        () => api.setBackupPassphrase('synthetic passphrase', true),
        'set_backup_passphrase',
        { passphrase: 'synthetic passphrase', remember: true },
      ],
      ['forgetBackupPassphrase', () => api.forgetBackupPassphrase(), 'forget_backup_passphrase', {}],
      ['backupNow', () => api.backupNow(), 'backup_now', {}],
      ['runDailyBackup', () => api.runDailyBackup(), 'run_daily_backup', {}],
      ['listBackups', () => api.listBackups(), 'list_backups', {}],
      ['chooseRestoreFile', () => api.chooseRestoreFile(), 'choose_restore_file', {}],
      [
        'restoreBackup',
        () => api.restoreBackup({ kind: 'registered', name: 'ttd-1-a.ttd.age' }, 'synthetic passphrase'),
        'restore_backup',
        { source: { kind: 'registered', name: 'ttd-1-a.ttd.age' }, passphrase: 'synthetic passphrase' },
      ],
      [
        'migrateJournal',
        () => api.migrateJournal('synthetic passphrase', false),
        'migrate_journal',
        { passphrase: 'synthetic passphrase', remember: false },
      ],
      ['eraseAppData', () => api.eraseAppData('ERASE'), 'erase_app_data', { confirmation: 'ERASE' }],
      ['confirmExit', () => api.confirmExit(), 'confirm_exit', {}],
    ];
    for (const [, invoke] of invocations) await invoke();
    expect(calls).toEqual(invocations.map(([, , command, args]) => [command, args]));
    const covered = new Set(invocations.map(([method]) => method));
    const methods = Object.keys(api).filter((method) => method !== 'onFlushRequest');
    expect(methods.filter((method) => !covered.has(method as keyof JournalApi))).toEqual([]);
  });

  it('passes native command errors through and hides other failures', async () => {
    mockIPC((command) => {
      if (command === 'save_entry') throw { code: 'conflict', message: 'This entry has changed.' };
      throw 'invalid args `id` for command `get_entry`';
    });
    const api = createTauriApi();
    await expect(api.saveEntry(newDraft('2026-11-22', 'evening', 'Europe/Paris'))).rejects.toEqual({
      code: 'conflict',
      message: 'This entry has changed.',
    });
    await expect(api.getEntry('x')).rejects.toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' });
  });

  it('listens for native quit requests until unsubscribed', async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const api = createTauriApi();
    const onRequest = vi.fn();
    const unsubscribe = api.onFlushRequest(onRequest);
    await vi.waitFor(async () => {
      await emit(FLUSH_REQUEST_EVENT);
      expect(onRequest).toHaveBeenCalled();
    });
    const count = onRequest.mock.calls.length;
    unsubscribe();
    await emit(FLUSH_REQUEST_EVENT);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRequest).toHaveBeenCalledTimes(count);
  });
});

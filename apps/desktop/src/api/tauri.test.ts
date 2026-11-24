import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDraft } from '../domain/entry';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import type { JournalApi } from './client';
import { createTauriApi, ENTRY_NOT_SENT, FLUSH_REQUEST_EVENT } from './tauri';

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
      ['retryStartup', () => api.retryStartup(), 'retry_startup', {}],
      ['today', () => api.today(), 'today', {}],
      ['getPreferences', () => api.getPreferences(), 'get_preferences', {}],
      [
        'setPreferences',
        () => api.setPreferences(DEFAULT_PREFERENCES),
        'set_preferences',
        { preferences: DEFAULT_PREFERENCES },
      ],
      ['entriesOn', () => api.entriesOn('2026-11-22'), 'entries_on', { date: '2026-11-22' }],
      ['listEntries', () => api.listEntries(), 'list_entries', {}],
      ['getEntry', () => api.getEntry(entry.id), 'get_entry', { id: entry.id }],
      ['saveEntry', () => api.saveEntry(entry), 'save_entry', { entry }],
      ['trashEntry', () => api.trashEntry(entry.id, 3), 'trash_entry', { id: entry.id, revision: 3 }],
      ['listTrash', () => api.listTrash(), 'list_trash', {}],
      ['restoreEntry', () => api.restoreEntry(entry.id), 'restore_entry', { id: entry.id }],
      [
        'deleteEntryPermanently',
        () => api.deleteEntryPermanently(entry.id),
        'delete_entry_permanently',
        { id: entry.id },
      ],
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
        {
          source: { kind: 'registered', name: 'ttd-1-a.ttd.age' },
          passphrase: 'synthetic passphrase',
          withoutSafetyBackup: false,
        },
      ],
      [
        'restoreBackup',
        () => api.restoreBackup({ kind: 'picked' }, 'synthetic passphrase', true),
        'restore_backup',
        { source: { kind: 'picked' }, passphrase: 'synthetic passphrase', withoutSafetyBackup: true },
      ],
      [
        'migrateJournal',
        () => api.migrateJournal('synthetic passphrase', false),
        'migrate_journal',
        { passphrase: 'synthetic passphrase', remember: false },
      ],
      [
        'migrateJournal',
        () => api.migrateJournal(null, true),
        'migrate_journal',
        { passphrase: null, remember: true },
      ],
      ['eraseAppData', () => api.eraseAppData('ERASE'), 'erase_app_data', { confirmation: 'ERASE' }],
      ['confirmExit', () => api.confirmExit(), 'confirm_exit', {}],
      ['cancelExit', () => api.cancelExit(), 'cancel_exit', {}],
      [
        'searchEntries',
        () => api.searchEntries({ text: 'synthetic' }),
        'search_entries',
        { request: { text: 'synthetic' } },
      ],
      [
        'readingReport',
        () => api.readingReport({ from: '2026-11-01', to: '2026-11-22' }),
        'reading_report',
        { request: { from: '2026-11-01', to: '2026-11-22' } },
      ],
      ['weeklyReview', () => api.weeklyReview('2026-11-22'), 'weekly_review', { date: '2026-11-22' }],
      [
        'saveWeeklyNotes',
        () => api.saveWeeklyNotes('2026-11-16', 'Synthetic notes.', 0),
        'save_weekly_notes',
        { date: '2026-11-16', notes: 'Synthetic notes.', revision: 0 },
      ],
      [
        'generateWeeklySummary',
        () => api.generateWeeklySummary('2026-11-16', 1),
        'generate_weekly_summary',
        { date: '2026-11-16', revision: 1 },
      ],
      ['clearReadingSummaries', () => api.clearReadingSummaries(), 'clear_reading_summaries', {}],
      ['listMilestones', () => api.listMilestones(), 'list_milestones', {}],
      [
        'saveMilestone',
        () =>
          api.saveMilestone({
            id: 'synthetic',
            date: '2026-11-22',
            title: 'Synthetic moment',
            notes: '',
            revision: 0,
          }),
        'save_milestone',
        {
          milestone: {
            id: 'synthetic',
            date: '2026-11-22',
            title: 'Synthetic moment',
            notes: '',
            revision: 0,
          },
        },
      ],
      [
        'deleteMilestone',
        () => api.deleteMilestone('synthetic', 1),
        'delete_milestone',
        { id: 'synthetic', revision: 1 },
      ],
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
    await expect(api.getEntry('x')).rejects.toEqual({
      code: 'unknown',
      message: 'Something went wrong. Please try again.',
    });
  });

  it('explains a save the journal never received, such as an entry the webview could not send', async () => {
    // Tauri answers a body it cannot parse (too deeply nested, a lone surrogate) with plain text.
    mockIPC((command) => {
      if (command === 'save_entry') throw 'Synthetic: the request body could not be parsed';
      throw new Error('Synthetic invoke failure');
    });
    const api = createTauriApi();
    await expect(api.saveEntry(newDraft('2026-11-22', 'evening', 'Europe/Paris'))).rejects.toEqual({
      code: 'document',
      message: 'The entry could not be sent to the journal. Undo your last change and try again.',
    });
    expect(ENTRY_NOT_SENT.code).toBe('document');
    // Other commands keep the generic message.
    await expect(api.listEntries()).rejects.toEqual({
      code: 'unknown',
      message: 'Something went wrong. Please try again.',
    });
  });

  it('passes the new native error codes through with their English messages', async () => {
    const errors = [
      { code: 'damaged', message: 'Part of the journal file is damaged and could not be read.' },
      { code: 'safetyBackupFailed', message: 'A safety backup of your current journal could not be made.' },
      { code: 'backupRegistry', message: 'This folder’s list of backups is damaged.' },
      { code: 'backupFolder', message: 'The backup folder is not available.' },
    ];
    let next = 0;
    mockIPC(() => {
      throw errors[next++];
    });
    const api = createTauriApi();
    for (const error of errors) {
      await expect(api.restoreBackup({ kind: 'picked' }, 'synthetic passphrase')).rejects.toEqual(error);
    }
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

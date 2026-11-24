// The renderer's only door to the journal. One method per native command
// (see the command table in the integration contract); implementations live in
// tauri.ts (native app) and memory.ts (browser preview and tests).

import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import type {
  BackupRecord,
  BackupStatus,
  CommandError,
  Entry,
  ErrorCode,
  PickedBackup,
  Preferences,
  RestoreOutcome,
  RestoreSource,
  StartupStatus,
  TrashItem,
  SearchRequest,
  ReadingReport,
  WeeklyReview,
  Milestone,
} from './types';

export interface JournalApi {
  startupStatus(): Promise<StartupStatus>;
  /**
   * Opens the journal again when the launch failed or found a journal this version cannot
   * open; otherwise resolves with the current status unchanged.
   */
  retryStartup(): Promise<StartupStatus>;
  /** Current civil date (YYYY-MM-DD) in the configured journal time zone. */
  today(): Promise<string>;
  getPreferences(): Promise<Preferences>;
  setPreferences(preferences: Preferences): Promise<Preferences>;
  /** Active entries for one journal date, Morning first. */
  entriesOn(date: string): Promise<Entry[]>;
  /** Active entries, newest journal date first. */
  listEntries(): Promise<Entry[]>;
  searchEntries(request: SearchRequest): Promise<Entry[]>;
  readingReport(request: SearchRequest): Promise<ReadingReport>;
  weeklyReview(date: string): Promise<WeeklyReview>;
  saveWeeklyNotes(date: string, notes: string, revision: number): Promise<WeeklyReview>;
  generateWeeklySummary(date: string, revision: number): Promise<WeeklyReview>;
  clearReadingSummaries(): Promise<void>;
  listMilestones(): Promise<Milestone[]>;
  saveMilestone(milestone: Milestone): Promise<Milestone>;
  deleteMilestone(id: string, revision: number): Promise<void>;
  getEntry(id: string): Promise<Entry>;
  /** Saves the whole aggregate; resolves with the acknowledged revision. */
  saveEntry(entry: Entry): Promise<Entry>;
  trashEntry(id: string, revision: number): Promise<void>;
  listTrash(): Promise<TrashItem[]>;
  restoreEntry(id: string): Promise<Entry>;
  deleteEntryPermanently(id: string): Promise<void>;
  purgeExpiredTrash(): Promise<void>;
  backupStatus(): Promise<BackupStatus>;
  /** Opens the native folder picker; cancelling leaves the status unchanged. */
  chooseBackupFolder(): Promise<BackupStatus>;
  setBackupPassphrase(passphrase: string, remember: boolean): Promise<BackupStatus>;
  forgetBackupPassphrase(): Promise<BackupStatus>;
  backupNow(): Promise<BackupStatus>;
  runDailyBackup(): Promise<BackupStatus>;
  listBackups(): Promise<BackupRecord[]>;
  /** Opens the native file picker; resolves null when cancelled. */
  chooseRestoreFile(): Promise<PickedBackup | null>;
  /**
   * Verifies the chosen backup, then replaces the journal with it. When a safety backup of
   * the current journal is needed but cannot be made because that journal cannot be read,
   * the restore is refused (safetyBackupFailed) unless withoutSafetyBackup is true. Without an
   * open journal (a failed or unsupported start), the unreadable journal is kept aside.
   */
  restoreBackup(
    source: RestoreSource,
    passphrase: string,
    withoutSafetyBackup?: boolean,
  ): Promise<RestoreOutcome>;
  /** A null passphrase uses the one already in this session (needsPassphrase when there is none). */
  migrateJournal(passphrase: string | null, remember: boolean): Promise<StartupStatus>;
  /** Requires the exact confirmation text "ERASE". */
  eraseAppData(confirmation: string): Promise<StartupStatus>;
  /** Subscribes to native quit requests; returns a synchronous unsubscribe. */
  onFlushRequest(callback: () => void | Promise<void>): () => void;
  /** Tells native code that pending saves were flushed and the app may quit. */
  confirmExit(): Promise<void>;
  /** Keeps the app open after a failed flush, allowing a later quit to retry. */
  cancelExit(): Promise<void>;
}

/** True inside the Tauri webview, false in a plain browser or jsdom. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'storage',
  'conflict',
  'occupied',
  'notFound',
  'date',
  'document',
  'migrationRequired',
  'unsupported',
  'score',
  'completion',
  'reflection',
  'emotion',
  'backup',
  'backupValidation',
  'restore',
  'passphrase',
  'damaged',
  'backupRegistry',
  'backupFolder',
  'safetyBackupFailed',
  'notReady',
  'needsFolder',
  'needsPassphrase',
  'keychain',
  'confirmation',
  'unknown',
]);

export const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function isCommandError(value: unknown): value is CommandError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    ERROR_CODES.has(candidate.code) &&
    typeof candidate.message === 'string' &&
    candidate.message.trim() !== ''
  );
}

/**
 * Normalises anything a command can reject with. Native command errors keep their
 * code and English message; anything else (an invoke failure, a programming error)
 * becomes a generic English message so internal details never reach the interface.
 */
export function toCommandError(error: unknown): CommandError {
  if (isCommandError(error)) return { code: error.code, message: error.message };
  return { code: 'unknown', message: UNKNOWN_ERROR_MESSAGE };
}

const ApiContext = createContext<JournalApi | null>(null);

export function ApiProvider({ api, children }: { api: JournalApi; children?: ReactNode }) {
  const observable = useMemo(() => {
    const mutations = new Set([
      'saveEntry',
      'trashEntry',
      'restoreEntry',
      'deleteEntryPermanently',
      'restoreBackup',
      'eraseAppData',
      'saveMilestone',
      'deleteMilestone',
      'clearReadingSummaries',
    ]);
    return new Proxy(api, {
      get(target, property) {
        const original = Reflect.get(target, property);
        if (typeof original !== 'function' || !mutations.has(String(property))) return original;
        return async (...args: unknown[]) => {
          const result = await original.apply(target, args);
          window.dispatchEvent(new Event('journal-changed'));
          return result;
        };
      },
    });
  }, [api]);
  return createElement(ApiContext.Provider, { value: observable }, children);
}

export function useApi(): JournalApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>.');
  return api;
}

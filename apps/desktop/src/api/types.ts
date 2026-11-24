// Shared contract between the React interface and the native journal commands.
// Field names mirror the serde (camelCase) serialisation of crates/journal-core.
// The renderer never sends filesystem paths or SQL; native commands own both.

import type { JSONContent } from '@tiptap/core';

export type Slot = 'morning' | 'evening';
export type Depth = 'quick' | 'daily' | 'deep';
export type Theme = 'system' | 'light' | 'dark';
export type WinOrigin = 'manual' | 'pride';
/** Interface text size in percent of the default. */
export type TextScale = 100 | 115 | 130 | 150;

export interface Reflection {
  intention: string;
  proudOf: string;
  difficulty: string;
  nextStep: string;
  helped: string;
  learned: string;
}

/** A reported action: something the person explicitly says they did. */
export interface Action {
  id: string;
  text: string;
  /** Preset category id (see ACTION_CATEGORIES) or '' for a custom action. */
  category: string;
}

/** A small win the person explicitly recognised. Counted once by its id. */
export interface Win {
  id: string;
  text: string;
  origin: WinOrigin;
  includeInInsights: boolean;
}

/** The complete entry aggregate. Saved and acknowledged as one revision. */
export interface Entry {
  id: string;
  /** Chosen civil journal date, YYYY-MM-DD. Never recomputed from timestamps. */
  date: string;
  slot: Slot;
  /** Canonical Tiptap/ProseMirror JSON document. Markdown is derived from it. */
  document: JSONContent;
  /** Last acknowledged revision; 0 for an entry that has never been saved. */
  revision: number;
  mood: number | null;
  energy: number | null;
  complete: boolean;
  title: string;
  pride: number | null;
  progress: number | null;
  /** Emotion vocabulary id, or '' when none was chosen. */
  emotion: string;
  /** The person's own emotion word ("Another emotion…"), in any language. */
  anotherEmotion: string;
  depth: Depth;
  reflection: Reflection;
  actions: Action[];
  wins: Win[];
  /** IANA time zone configured when the entry was created (context only). */
  createdTimeZone: string;
  /** Older journals default to true; exclusion affects insights, never original reading. */
  includeInInsights?: boolean;
}

export interface Preferences {
  timeZone: string;
  theme: Theme;
  gentle: boolean;
  showDurations: boolean;
  showToolbar: boolean;
  showScores: boolean;
  sidebarOpen: boolean;
  reduceMotion: boolean;
  defaultDepth: Depth;
  showWordCount: boolean;
  /** Text size for the whole interface and the journal page; layout spacing is unchanged. */
  textScale: TextScale;
  timelineDays?: 7 | 14 | 30;
  timelineMetrics?: ScoreMetric[];
}

export interface TrashItem {
  entry: Entry;
  /** Unix seconds. */
  deletedAt: number;
  /** Unix seconds; deletedAt + 30 days. */
  expiresAt: number;
}

export type ErrorCode =
  | 'storage'
  | 'conflict'
  | 'occupied'
  | 'notFound'
  | 'date'
  | 'document'
  | 'migrationRequired'
  | 'unsupported'
  | 'score'
  | 'completion'
  | 'reflection'
  | 'emotion'
  | 'backup'
  | 'backupValidation'
  | 'restore'
  | 'passphrase'
  | 'damaged'
  | 'backupRegistry'
  | 'backupFolder'
  | 'safetyBackupFailed'
  | 'notReady'
  | 'needsFolder'
  | 'needsPassphrase'
  | 'keychain'
  | 'confirmation'
  | 'unknown';

/** Every rejected command resolves to this shape with an English message. */
export interface CommandError {
  code: ErrorCode;
  message: string;
}

export type StartupState = 'ready' | 'needsMigration' | 'unsupported' | 'failed';

export interface StartupStatus {
  state: StartupState;
  /** Schema version of an existing journal that needs a protected upgrade. */
  fromVersion: number | null;
  /**
   * English explanation for unsupported/failed states, and for needsMigration when the
   * automatic protected upgrade at launch could not run (for example its backup failed).
   */
  message: string | null;
  /** Display-only path of the application data folder. */
  dataLocation: string;
}

export type BackupState =
  'settingsUnreadable' | 'needsFolder' | 'needsPassphrase' | 'due' | 'upToDate' | 'failed';

/**
 * What macOS Keychain did not do after a passphrase change, which still applies to this
 * session: 'notRemembered' when it could not store the passphrase, so it lasts for this session
 * only; 'notRemoved' when it could not remove the remembered passphrase, which may remain in
 * Keychain although the app no longer reads it.
 */
export type KeychainWarning = 'notRemembered' | 'notRemoved';

export interface BackupStatus {
  state: BackupState;
  /** Display-only folder name and path. Never sent back to native code. */
  folderName: string | null;
  folderPath: string | null;
  /** The passphrase is available in this session (typed or read from Keychain). */
  passphraseAvailable: boolean;
  /** The passphrase is stored in macOS Keychain. */
  remembered: boolean;
  /**
   * The launch is still reading the remembered passphrase from macOS Keychain, for example
   * while its prompt waits for an answer, and no passphrase change has replaced it since.
   */
  keychainPending: boolean;
  /** Set only in the reply to setBackupPassphrase or forgetBackupPassphrase. */
  keychainWarning: KeychainWarning | null;
  /** Journal date of the last successful backup. */
  lastSuccessDate: string | null;
  /** Unix seconds of the last successful backup. */
  lastSuccessAt: number | null;
  /** Last failed attempt since the last success. */
  lastError: CommandError | null;
  /** Pruning older backups failed; nothing was deleted. */
  retentionWarning: boolean;
  /** Validated backups registered in the chosen folder. */
  backupCount: number;
}

export interface BackupRecord {
  /** File name inside the chosen backup folder, e.g. ttd-1795363200-<uuid>.ttd.age */
  name: string;
  /** Unix seconds. */
  createdAt: number;
  sizeBytes: number;
}

export interface PickedBackup {
  /** Display-only file name of the backup chosen in the native dialog. */
  name: string;
}

export type RestoreSource = { kind: 'registered'; name: string } | { kind: 'picked' };

export interface RestoreOutcome {
  /** Active entries in the restored journal. */
  entries: number;
  /** A validated backup of the replaced journal was created first. */
  safetyBackup: boolean;
  /**
   * Display-only file name of an unreadable journal that was kept aside in the data folder
   * (restore from the startup screen); null when the journal was replaced in place.
   */
  setAside: string | null;
}

export type ScoreMetric = 'mood' | 'energy' | 'pride' | 'progress';
export interface SearchRequest {
  text?: string;
  from?: string | null;
  to?: string | null;
  slot?: Slot | null;
  emotion?: string | null;
  complete?: boolean | null;
  hasWin?: boolean | null;
  metric?: ScoreMetric | null;
  minimum?: number | null;
}
export interface Measure {
  observations: number;
  recordedDays: number;
  mean: number | null;
}
export interface Observation {
  id: string;
  slot: Slot;
  mood: number | null;
  energy: number | null;
  pride: number | null;
  progress: number | null;
}
export interface DayObservations {
  date: string;
  observations: Observation[];
}
export interface ReadingReport {
  from: string;
  to: string;
  calendarDays: number;
  recordedDays: number;
  entries: number;
  wins: number;
  actions: number;
  mood: Measure;
  energy: Measure;
  pride: Measure;
  progress: Measure;
  days: DayObservations[];
}
export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  notes: string;
  revision: number;
  summary: string | null;
  stale: boolean;
  report: ReadingReport;
}
export interface Milestone {
  id: string;
  date: string;
  title: string;
  notes: string;
  revision: number;
}

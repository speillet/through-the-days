// Shared contract between the React interface and the native journal commands.
// Field names mirror the serde (camelCase) serialisation of crates/journal-core.
// The renderer never sends filesystem paths or SQL; native commands own both.

import type { JSONContent } from '@tiptap/core';

export type Slot = 'morning' | 'evening';
export type Depth = 'quick' | 'daily' | 'deep';
export type Theme = 'system' | 'light' | 'dark';
export type WinOrigin = 'manual' | 'pride';

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
  /** English explanation for unsupported/failed states. */
  message: string | null;
  /** Display-only path of the application data folder. */
  dataLocation: string;
}

export type BackupState = 'needsFolder' | 'needsPassphrase' | 'due' | 'upToDate' | 'failed';

export interface BackupStatus {
  state: BackupState;
  /** Display-only folder name and path. Never sent back to native code. */
  folderName: string | null;
  folderPath: string | null;
  /** The passphrase is available in this session (typed or read from Keychain). */
  passphraseAvailable: boolean;
  /** The passphrase is stored in macOS Keychain. */
  remembered: boolean;
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
}

// Browser-preview and test implementation of JournalApi. It keeps synthetic data
// in Web Storage under one key, so reloading the page behaves like restarting the
// app, and reproduces journal-core's rules (crates/journal-core/src) so the
// interface meets the same validation, conflicts and errors as the native journal.
//
// Backups are simulated: nothing is encrypted, no file is written, and a
// passphrase is never stored. Each simulated backup keeps a non-cryptographic
// fingerprint of its passphrase only to reproduce the wrong-passphrase failure.

import { canComplete, isBlank, newId } from '../domain/entry';
import { isEmotionId } from '../domain/emotions';
import { isIsoDate, isValidTimeZone, todayIn } from '../domain/dates';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import { UNKNOWN_ERROR_MESSAGE, type JournalApi } from './client';
import type {
  BackupState,
  BackupStatus,
  CommandError,
  Entry,
  ErrorCode,
  Preferences,
  RestoreSource,
  StartupStatus,
  TrashItem,
} from './types';

export const MEMORY_STORAGE_KEY = 'ttd-preview-v1';
export const SYNTHETIC_BACKUP_FOLDER = 'Synthetic backups';
export const SYNTHETIC_BACKUP_PATH = '~/Documents/Synthetic backups';
export const TRASH_RETENTION_SECONDS = 30 * 86_400;
/** D-009: keep the 30 latest validated backups. */
export const BACKUP_RETENTION_COUNT = 30;
const ERASE_CONFIRMATION = 'ERASE';
const MAX_REVISION = 4_294_967_295; // u32::MAX in journal-core

/** English messages, identical to journal-core's for the codes it defines. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = Object.freeze({
  storage: 'The journal could not be saved. Check available disk space and try again.',
  conflict: 'This entry has changed. Reopen it before saving to avoid overwriting another revision.',
  occupied: 'This date and slot already contain an entry. Choose a free slot.',
  notFound: 'The entry is no longer available.',
  date: 'Choose a valid journal date in YYYY-MM-DD format.',
  document: 'The journal document has an unsupported structure.',
  migrationRequired: 'This journal needs a protected migration before it can be opened.',
  unsupported:
    'This journal was created by a newer version of Through the Days or is not a journal database. It has not been changed.',
  score: 'Mood and energy must be whole numbers from 0 to 10; pride and progress from 1 to 10.',
  completion: 'Add some writing, a mood score and an energy score before marking this entry complete.',
  reflection: 'Each action and small win needs a unique ID and some text.',
  emotion: 'Choose an emotion from the list or describe it in your own words.',
  backup: 'The backup could not be created. Check the selected folder and available disk space, then try again.',
  backupValidation: 'Backup validation failed. The previous backups remain available.',
  restore:
    'The backup could not be restored. Check the passphrase and choose a complete supported backup. Your current journal is unchanged.',
  passphrase: 'Choose a backup passphrase with at least 12 characters. Keep it somewhere safe for recovery.',
  notReady: 'The journal is not open yet. Finish the step on screen first.',
  needsFolder: 'Choose a backup folder first.',
  needsPassphrase: 'Enter your backup passphrase first.',
  keychain: 'macOS Keychain could not store or read the backup passphrase. You can still type it when needed.',
  confirmation: 'Type ERASE in capital letters to confirm.',
  unknown: UNKNOWN_ERROR_MESSAGE,
});

function failure(code: ErrorCode): CommandError {
  return { code, message: ERROR_MESSAGES[code] };
}

export interface MemoryApiOptions {
  /** Defaults to window.localStorage (or a private in-memory store when unavailable). */
  storage?: Storage;
  /** Clock for today, trash retention and backup times. */
  now?: () => Date;
  /** Simulates a startup state such as needsMigration; defaults to ready. */
  startup?: Partial<StartupStatus>;
}

interface StoredEntry {
  entry: Entry;
  /** Unix seconds; null while active. */
  trashedAt: number | null;
}

interface JournalSnapshot {
  entries: StoredEntry[];
  preferences: Preferences;
}

interface SimulatedBackup {
  name: string;
  createdAt: number;
  sizeBytes: number;
  fingerprint: string;
  snapshot: JournalSnapshot;
}

interface PersistedState {
  version: 1;
  /** The live journal database. */
  journal: JournalSnapshot;
  /** Device-local backup plan, kept outside the journal like backup-plan.json. */
  plan: {
    folderChosen: boolean;
    lastSuccessDate: string | null;
    lastSuccessAt: number | null;
    retentionWarning: boolean;
    /** Simulated Keychain item. */
    rememberedFingerprint: string | null;
  };
  /** Files in the simulated backup folder; erasing app data never removes them. */
  folder: SimulatedBackup[];
}

function initialState(): PersistedState {
  return {
    version: 1,
    journal: { entries: [], preferences: { ...DEFAULT_PREFERENCES } },
    plan: {
      folderChosen: false,
      lastSuccessDate: null,
      lastSuccessAt: null,
      retentionWarning: false,
      rememberedFingerprint: null,
    },
    folder: [],
  };
}

/** A Storage held in memory, for tests and browsers that block Web Storage. */
export function createMemoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => Array.from(items.keys())[index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
}

function defaultStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

/** Simulation only: FNV-1a tells backups apart by passphrase. It is not cryptography. */
function fingerprint(passphrase: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < passphrase.length; index += 1) {
    hash ^= passphrase.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function validatePassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || Array.from(passphrase).length < 12) throw failure('passphrase');
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Structural checks: the native command rejects these while deserialising.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw failure('document');
}

function stringField(value: Record<string, unknown>, key: string, fallback?: string): string {
  const field = value[key];
  if (field === undefined && fallback !== undefined) return fallback;
  if (typeof field !== 'string') throw failure('document');
  return field;
}

function booleanField(value: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const field = value[key];
  if (field === undefined) return fallback;
  if (typeof field !== 'boolean') throw failure('document');
  return field;
}

function scoreField(value: Record<string, unknown>, key: string): number | null {
  const field = value[key];
  if (field === undefined || field === null) return null;
  if (typeof field !== 'number' || !Number.isInteger(field)) throw failure('score');
  return field;
}

const ENTRY_KEYS = [
  'id',
  'date',
  'slot',
  'document',
  'revision',
  'mood',
  'energy',
  'complete',
  'title',
  'pride',
  'progress',
  'emotion',
  'anotherEmotion',
  'depth',
  'reflection',
  'actions',
  'wins',
  'createdTimeZone',
] as const;
const REFLECTION_KEYS = ['intention', 'proudOf', 'difficulty', 'nextStep', 'helped', 'learned'] as const;

function normaliseEntry(input: unknown): Entry {
  if (!isRecord(input)) throw failure('document');
  rejectUnknownKeys(input, ENTRY_KEYS);
  const slot = input.slot;
  if (slot !== 'morning' && slot !== 'evening') throw failure('document');
  const depth = input.depth ?? 'daily';
  if (depth !== 'quick' && depth !== 'daily' && depth !== 'deep') throw failure('document');
  const revision = input.revision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0 || revision > MAX_REVISION) {
    throw failure('document');
  }
  if (!isRecord(input.document)) throw failure('document');
  const reflectionInput = input.reflection ?? {};
  if (!isRecord(reflectionInput)) throw failure('document');
  rejectUnknownKeys(reflectionInput, REFLECTION_KEYS);
  const reflection = Object.fromEntries(
    REFLECTION_KEYS.map((key) => [key, stringField(reflectionInput, key, '')]),
  ) as unknown as Entry['reflection'];
  const actions = input.actions ?? [];
  const wins = input.wins ?? [];
  if (!Array.isArray(actions) || !Array.isArray(wins)) throw failure('document');
  return {
    id: stringField(input, 'id'),
    date: stringField(input, 'date'),
    slot,
    document: copy(input.document),
    revision,
    mood: scoreField(input, 'mood'),
    energy: scoreField(input, 'energy'),
    complete: booleanField(input, 'complete', false),
    title: stringField(input, 'title', ''),
    pride: scoreField(input, 'pride'),
    progress: scoreField(input, 'progress'),
    emotion: stringField(input, 'emotion', ''),
    anotherEmotion: stringField(input, 'anotherEmotion', ''),
    depth,
    reflection,
    actions: actions.map((action: unknown) => {
      if (!isRecord(action)) throw failure('document');
      rejectUnknownKeys(action, ['id', 'text', 'category']);
      return { id: stringField(action, 'id'), text: stringField(action, 'text'), category: stringField(action, 'category') };
    }),
    wins: wins.map((win: unknown) => {
      if (!isRecord(win)) throw failure('document');
      rejectUnknownKeys(win, ['id', 'text', 'origin', 'includeInInsights']);
      if (typeof win.includeInInsights !== 'boolean') throw failure('document');
      return {
        id: stringField(win, 'id'),
        text: stringField(win, 'text'),
        origin: stringField(win, 'origin') as Entry['wins'][number]['origin'],
        includeInInsights: win.includeInInsights,
      };
    }),
    createdTimeZone: stringField(input, 'createdTimeZone', 'Europe/Paris'),
  };
}

// ---------------------------------------------------------------------------
// Semantic validation, in the order of journal-core's Entry::validate.

const UUID =
  /^(?:urn:uuid:)?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[0-9a-f]{32})$/i;
const NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
]);
const MARK_TYPES = new Set(['bold', 'italic', 'strike', 'code', 'underline', 'link']);

function validateNode(node: unknown): void {
  if (!isRecord(node) || typeof node.type !== 'string' || !NODE_TYPES.has(node.type)) throw failure('document');
  if (node.type === 'text' && typeof node.text !== 'string') throw failure('document');
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) throw failure('document');
    for (const mark of node.marks) {
      if (!isRecord(mark) || typeof mark.type !== 'string' || !MARK_TYPES.has(mark.type)) throw failure('document');
    }
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) throw failure('document');
    node.content.forEach(validateNode);
  }
}

function validateEntry(entry: Entry): void {
  const inRange = (value: number | null, min: number) => value === null || (value >= min && value <= 10);
  if (!inRange(entry.mood, 0) || !inRange(entry.energy, 0)) throw failure('score');
  if (!inRange(entry.pride, 1) || !inRange(entry.progress, 1)) throw failure('score');
  if (entry.emotion !== '' && !isEmotionId(entry.emotion)) throw failure('emotion');
  if (!isValidTimeZone(entry.createdTimeZone)) throw failure('date');
  const actionIds = new Set<string>();
  for (const action of entry.actions) {
    if (action.id === '' || isBlank(action.text) || actionIds.has(action.id)) throw failure('reflection');
    actionIds.add(action.id);
  }
  const winIds = new Set<string>();
  let promoted = false;
  for (const win of entry.wins) {
    if (win.id === '' || isBlank(win.text) || winIds.has(win.id)) throw failure('reflection');
    if (win.origin !== 'manual' && win.origin !== 'pride') throw failure('reflection');
    winIds.add(win.id);
    if (win.origin === 'pride') {
      if (promoted) throw failure('reflection');
      promoted = true;
    }
  }
  if (!isIsoDate(entry.date)) throw failure('date');
  if (!UUID.test(entry.id) || entry.document.type !== 'doc') throw failure('document');
  validateNode(entry.document);
}

const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[];

function normalisePreferences(input: unknown): Preferences {
  if (!isRecord(input)) throw failure('document');
  rejectUnknownKeys(input, PREFERENCE_KEYS);
  const merged = { ...DEFAULT_PREFERENCES, ...input } as Record<string, unknown>;
  for (const key of PREFERENCE_KEYS) {
    const expected = typeof DEFAULT_PREFERENCES[key];
    if (typeof merged[key] !== expected) throw failure('document');
  }
  const preferences = merged as unknown as Preferences;
  if (!isValidTimeZone(preferences.timeZone)) throw failure('date');
  if (!['system', 'light', 'dark'].includes(preferences.theme)) throw failure('document');
  if (!['quick', 'daily', 'deep'].includes(preferences.defaultDepth)) throw failure('document');
  return preferences;
}

function sortBySlot(a: StoredEntry, b: StoredEntry): number {
  // journal-core orders slots descending as text: "morning" before "evening".
  return a.entry.slot === b.entry.slot ? 0 : a.entry.slot === 'morning' ? -1 : 1;
}

// ---------------------------------------------------------------------------

export function createMemoryApi(options: MemoryApiOptions = {}): JournalApi {
  const storage = options.storage ?? defaultStorage();
  const now = options.now ?? (() => new Date());
  const nowUnix = () => Math.floor(now().getTime() / 1000);

  const requested = options.startup ?? {};
  const requestedState = requested.state ?? 'ready';
  let startup: StartupStatus = {
    state: requestedState,
    fromVersion: requested.fromVersion ?? (requestedState === 'needsMigration' ? 1 : null),
    message:
      requested.message ??
      (requestedState === 'unsupported'
        ? ERROR_MESSAGES.unsupported
        : requestedState === 'failed'
          ? 'The journal could not be opened. It has not been changed.'
          : null),
    dataLocation: requested.dataLocation ?? 'Browser preview storage (synthetic data only)',
  };

  // Session state: like the native app, a typed passphrase lives only in memory;
  // a remembered one is read back from the simulated Keychain at launch.
  let sessionFingerprint: string | null = load().plan.rememberedFingerprint;
  let lastError: CommandError | null = null;
  let pickedBackup: string | null = null;

  function load(): PersistedState {
    let raw: string | null = null;
    try {
      raw = storage.getItem(MEMORY_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return initialState();
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed && parsed.version === 1 && isRecord(parsed.journal)) {
        parsed.journal.preferences = { ...DEFAULT_PREFERENCES, ...parsed.journal.preferences };
        return parsed;
      }
    } catch {
      // A damaged preview store starts again; it only ever holds synthetic data.
    }
    return initialState();
  }

  function commit(next: PersistedState): void {
    try {
      storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw failure('storage');
    }
  }

  function requireReady(): void {
    if (startup.state !== 'ready') throw failure('notReady');
  }

  function journalToday(state: PersistedState): string {
    return todayIn(state.journal.preferences.timeZone, now());
  }

  function statusOf(state: PersistedState): BackupStatus {
    const { plan } = state;
    let backupState: BackupState;
    if (!plan.folderChosen) backupState = 'needsFolder';
    else if (plan.lastSuccessDate === journalToday(state)) backupState = 'upToDate';
    else if (sessionFingerprint === null) backupState = 'needsPassphrase';
    else if (lastError) backupState = 'failed';
    else backupState = 'due';
    return {
      state: backupState,
      folderName: plan.folderChosen ? SYNTHETIC_BACKUP_FOLDER : null,
      folderPath: plan.folderChosen ? SYNTHETIC_BACKUP_PATH : null,
      passphraseAvailable: sessionFingerprint !== null,
      remembered: plan.rememberedFingerprint !== null,
      lastSuccessDate: plan.lastSuccessDate,
      lastSuccessAt: plan.lastSuccessAt,
      lastError: lastError ? { ...lastError } : null,
      retentionWarning: plan.retentionWarning,
      backupCount: plan.folderChosen ? state.folder.length : 0,
    };
  }

  /** Publishes a simulated backup of the live journal into the folder. */
  function addBackup(state: PersistedState, passphraseFingerprint: string): void {
    const createdAt = nowUnix();
    const snapshot = copy(state.journal);
    state.folder.push({
      name: `ttd-${createdAt}-${newId()}.ttd.age`,
      createdAt,
      sizeBytes: JSON.stringify(snapshot).length,
      fingerprint: passphraseFingerprint,
      snapshot,
    });
    // Keep the 30 latest, pruning only after the new backup exists.
    state.folder.sort((a, b) => a.createdAt - b.createdAt);
    while (state.folder.length > BACKUP_RETENTION_COUNT) state.folder.shift();
  }

  /** Backs up, records success only once the result is stored, and tracks failures. */
  function publishBackup(state: PersistedState, passphraseFingerprint: string): void {
    addBackup(state, passphraseFingerprint);
    state.plan.lastSuccessDate = journalToday(state);
    state.plan.lastSuccessAt = nowUnix();
    state.plan.retentionWarning = false;
    try {
      commit(state);
    } catch {
      lastError = failure('backup');
      throw lastError;
    }
    lastError = null;
  }

  function findActive(state: PersistedState, id: string): StoredEntry | undefined {
    return state.journal.entries.find((item) => item.entry.id === id && item.trashedAt === null);
  }

  function findTrashed(state: PersistedState, id: string): StoredEntry | undefined {
    return state.journal.entries.find((item) => item.entry.id === id && item.trashedAt !== null);
  }

  function slotTaken(state: PersistedState, entry: Entry, exceptId?: string): boolean {
    return state.journal.entries.some(
      (item) =>
        item.trashedAt === null &&
        item.entry.date === entry.date &&
        item.entry.slot === entry.slot &&
        item.entry.id !== exceptId,
    );
  }

  return {
    async startupStatus() {
      return { ...startup };
    },

    async today() {
      requireReady();
      return journalToday(load());
    },

    async getPreferences() {
      requireReady();
      return load().journal.preferences;
    },

    async setPreferences(input) {
      requireReady();
      const preferences = normalisePreferences(input);
      const state = load();
      state.journal.preferences = preferences;
      commit(state);
      return { ...preferences };
    },

    async entriesOn(date) {
      requireReady();
      if (!isIsoDate(date)) throw failure('date');
      return load()
        .journal.entries.filter((item) => item.trashedAt === null && item.entry.date === date)
        .sort(sortBySlot)
        .map((item) => item.entry);
    },

    async listEntries() {
      requireReady();
      return load()
        .journal.entries.filter((item) => item.trashedAt === null)
        .sort((a, b) => (a.entry.date === b.entry.date ? sortBySlot(a, b) : a.entry.date < b.entry.date ? 1 : -1))
        .map((item) => item.entry);
    },

    async getEntry(id) {
      requireReady();
      const found = findActive(load(), id);
      if (!found) throw failure('notFound');
      return found.entry;
    },

    async saveEntry(input) {
      requireReady();
      const entry = normaliseEntry(input);
      validateEntry(entry);
      const state = load();
      const existing = state.journal.entries.find((item) => item.entry.id === entry.id);
      if (existing && existing.trashedAt !== null) throw failure('notFound');
      if ((existing?.entry.revision ?? 0) !== entry.revision) throw failure('conflict');
      let complete = entry.complete;
      if (complete && !canComplete(entry)) {
        // Autosave never completes an entry; an edit that empties a complete one demotes it.
        if (existing?.entry.complete) complete = false;
        else throw failure('completion');
      }
      if (slotTaken(state, entry, entry.id)) throw failure('occupied');
      if (entry.revision >= MAX_REVISION) throw failure('conflict');
      const saved: Entry = { ...entry, complete, revision: entry.revision + 1 };
      if (existing) existing.entry = saved;
      else state.journal.entries.push({ entry: saved, trashedAt: null });
      commit(state);
      return copy(saved);
    },

    async trashEntry(id, revision) {
      requireReady();
      const state = load();
      const found = findActive(state, id);
      if (!found) throw failure('notFound');
      if (found.entry.revision !== revision) throw failure('conflict');
      found.trashedAt = nowUnix();
      commit(state);
    },

    async listTrash() {
      requireReady();
      return load()
        .journal.entries.filter((item): item is StoredEntry & { trashedAt: number } => item.trashedAt !== null)
        .sort((a, b) => b.trashedAt - a.trashedAt)
        .map(
          (item): TrashItem => ({
            entry: item.entry,
            deletedAt: item.trashedAt,
            expiresAt: item.trashedAt + TRASH_RETENTION_SECONDS,
          }),
        );
    },

    async restoreEntry(id) {
      requireReady();
      const state = load();
      const found = findTrashed(state, id);
      if (!found) throw failure('notFound');
      if (slotTaken(state, found.entry)) throw failure('occupied');
      if (found.entry.revision >= MAX_REVISION) throw failure('conflict');
      found.entry = { ...found.entry, revision: found.entry.revision + 1 };
      found.trashedAt = null;
      commit(state);
      return copy(found.entry);
    },

    async deleteEntryPermanently(id) {
      requireReady();
      const state = load();
      const found = findTrashed(state, id);
      if (!found) throw failure('notFound');
      state.journal.entries = state.journal.entries.filter((item) => item !== found);
      commit(state);
    },

    async purgeExpiredTrash() {
      requireReady();
      const state = load();
      const cutoff = nowUnix() - TRASH_RETENTION_SECONDS;
      const kept = state.journal.entries.filter((item) => item.trashedAt === null || item.trashedAt > cutoff);
      if (kept.length === state.journal.entries.length) return;
      state.journal.entries = kept;
      commit(state);
    },

    async backupStatus() {
      return statusOf(load());
    },

    async chooseBackupFolder() {
      const state = load();
      state.plan.folderChosen = true;
      commit(state);
      return statusOf(state);
    },

    async setBackupPassphrase(passphrase, remember) {
      validatePassphrase(passphrase);
      const state = load();
      sessionFingerprint = fingerprint(passphrase);
      state.plan.rememberedFingerprint = remember ? sessionFingerprint : null;
      commit(state);
      return statusOf(state);
    },

    async forgetBackupPassphrase() {
      const state = load();
      sessionFingerprint = null;
      state.plan.rememberedFingerprint = null;
      commit(state);
      return statusOf(state);
    },

    async backupNow() {
      requireReady();
      const state = load();
      if (!state.plan.folderChosen) throw failure('needsFolder');
      if (sessionFingerprint === null) throw failure('needsPassphrase');
      publishBackup(state, sessionFingerprint);
      return statusOf(state);
    },

    async runDailyBackup() {
      requireReady();
      const state = load();
      const due = state.plan.lastSuccessDate !== journalToday(state);
      if (!due || !state.plan.folderChosen || sessionFingerprint === null) return statusOf(state);
      try {
        publishBackup(state, sessionFingerprint);
      } catch {
        // A failed daily attempt is reported in the status rather than thrown.
        return statusOf(load());
      }
      return statusOf(state);
    },

    async listBackups() {
      const state = load();
      if (!state.plan.folderChosen) return [];
      return [...state.folder]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ name, createdAt, sizeBytes }) => ({ name, createdAt, sizeBytes }));
    },

    async chooseRestoreFile() {
      const newest = [...load().folder].sort((a, b) => b.createdAt - a.createdAt)[0];
      pickedBackup = newest?.name ?? null;
      return newest ? { name: newest.name } : null;
    },

    async restoreBackup(source: RestoreSource, passphrase) {
      requireReady();
      const state = load();
      const name = source.kind === 'registered' ? (state.plan.folderChosen ? source.name : null) : pickedBackup;
      const backup = state.folder.find((item) => item.name === name);
      if (!backup || typeof passphrase !== 'string' || fingerprint(passphrase) !== backup.fingerprint) {
        throw failure('restore');
      }
      let safetyBackup = false;
      if (state.journal.entries.length > 0 && state.plan.folderChosen && sessionFingerprint !== null) {
        addBackup(state, sessionFingerprint);
        safetyBackup = true;
      }
      state.journal = copy(backup.snapshot);
      commit(state);
      return {
        entries: state.journal.entries.filter((item) => item.trashedAt === null).length,
        safetyBackup,
      };
    },

    async migrateJournal(passphrase, remember) {
      if (startup.state !== 'needsMigration') return { ...startup };
      const state = load();
      if (!state.plan.folderChosen) throw failure('needsFolder');
      validatePassphrase(passphrase);
      sessionFingerprint = fingerprint(passphrase);
      state.plan.rememberedFingerprint = remember ? sessionFingerprint : null;
      addBackup(state, sessionFingerprint);
      commit(state);
      startup = { ...startup, state: 'ready', fromVersion: null, message: null };
      return { ...startup };
    },

    async eraseAppData(confirmation) {
      if (confirmation !== ERASE_CONFIRMATION) throw failure('confirmation');
      const state = load();
      const fresh = initialState();
      commit({ ...fresh, folder: state.folder });
      sessionFingerprint = null;
      lastError = null;
      pickedBackup = null;
      startup = { state: 'ready', fromVersion: null, message: null, dataLocation: startup.dataLocation };
      return { ...startup };
    },

    onFlushRequest() {
      // A browser has no native quit request to answer.
      return () => {};
    },

    async confirmExit() {},
  };
}

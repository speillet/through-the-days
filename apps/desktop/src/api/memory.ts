// Browser-preview and test implementation of JournalApi. It keeps synthetic data
// in Web Storage under one key, so reloading the page behaves like restarting the
// app, and reproduces journal-core's rules (crates/journal-core/src) and the native
// shell's (apps/desktop/src-tauri/src/state) so the interface meets the same
// validation, conflicts, states and errors as the native journal.
//
// Backups are simulated: nothing is encrypted, no file is written, and a
// passphrase is never stored. Each simulated backup keeps a non-cryptographic
// fingerprint of its passphrase only to reproduce the wrong-passphrase failure.
//
// Damage can be simulated in the stored data, for tests and the browser preview:
// - a `journal` that is not a journal snapshot is a damaged journal file: the launch fails
//   with the damaged message, like a journal whose header can't be read;
// - an item of `journal.entries` whose `entry` is not an object is a damaged page in an
//   open journal: every operation that reads the entries fails with `damaged`;
// - a `plan` that is not a backup plan is an unreadable backup-plan.json
//   (settingsUnreadable until a backup folder is chosen again).

import { canComplete, isBlank, newId } from '../domain/entry';
import { isEmotionId } from '../domain/emotions';
import { isIsoDate, isValidTimeZone, todayIn } from '../domain/dates';
import { DEFAULT_PREFERENCES, isTextScale, SCORE_METRICS, THEME_OPTIONS, TIMELINE_RANGES } from '../domain/preferences';
import { BACKUPS_KEPT, PASSPHRASE_MIN_LENGTH } from '../domain/backup';
import { DEPTH_OPTIONS } from '../domain/copy';
import { JOURNAL_MARK_TYPES, JOURNAL_NODE_TYPES, MAX_DOCUMENT_DEPTH } from '../domain/document';
import { UNKNOWN_ERROR_MESSAGE, type JournalApi } from './client';
import {filterPreviewEntries, fnv1a, previewReport, previewWeek, previewFingerprint, isoWeekStart, localSummary} from './reading-preview';
import type {
  BackupState,
  BackupStatus,
  CommandError,
  Entry,
  ErrorCode,
  Preferences,
  RestoreOutcome,
  RestoreSource,
  StartupState,
  StartupStatus,
  TrashItem,
} from './types';

export const MEMORY_STORAGE_KEY = 'ttd-preview-v1';
const SYNTHETIC_BACKUP_FOLDER = 'Synthetic backups';
const SYNTHETIC_BACKUP_PATH = '~/Documents/Synthetic backups';
const TRASH_RETENTION_SECONDS = 30 * 86_400;
/** After a failed automatic backup, the daily routine waits this long unless the folder or passphrase changes. */
const AUTOMATIC_RETRY_SECONDS = 60 * 60;
/** The native shell's message when the journal could not be opened for another reason. */
export const OPEN_FAILED_MESSAGE = 'The journal could not be opened. It has not been changed.';
const PREVIEW_DATA_LOCATION = 'Browser preview storage (synthetic data only)';
const ERASE_CONFIRMATION = 'ERASE';
const MAX_REVISION = 4_294_967_295; // u32::MAX in journal-core

/** English messages, identical to journal-core's and the native shell's for the codes they define. */
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
  damaged: 'Part of the journal file is damaged and could not be read. You can restore your journal from a backup.',
  backupRegistry:
    "This folder's list of backups is damaged or was made by a newer version. Choose a different backup folder; the backups already in it can still be restored with Choose a backup file…",
  backupFolder:
    "The backup folder is not available or can't be written to. Reconnect the drive or choose another folder.",
  backupUnavailable:
    'The backup is not available. Reconnect the drive that holds it or choose another backup. Your current journal is unchanged.',
  safetyBackupFailed:
    'A safety backup of your current journal could not be made, so nothing was restored. If your current journal is damaged, you can restore without a safety backup.',
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

function isFailure(value: unknown): value is CommandError {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string';
}

export interface MemoryApiOptions {
  /** Defaults to window.localStorage (or a private in-memory store when unavailable). */
  storage?: Storage;
  /** Clock for today, trash retention and backup times. */
  now?: () => Date;
  /**
   * Simulates the state found at launch; by default it follows the stored journal (ready, or
   * failed when the stored journal is damaged). "failed" is a passing failure that
   * retryStartup clears; "unsupported" is a journal this version cannot open, which stays
   * until a restore or an erase replaces it; "needsMigration" waits for migrateJournal, unless
   * a restore or an erase replaces the older journal first.
   */
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
  weeklyReviews?: Record<string, import('./reading-preview').PreviewReview>;
  milestones?: import('./types').Milestone[];
}

interface SimulatedBackup {
  name: string;
  createdAt: number;
  sizeBytes: number;
  fingerprint: string;
  snapshot: JournalSnapshot;
}

/** Device-local backup plan, kept outside the journal like backup-plan.json. */
interface BackupPlan {
  folderChosen: boolean;
  lastSuccessDate: string | null;
  lastSuccessAt: number | null;
  retentionWarning: boolean;
  /** Simulated Keychain item. */
  rememberedFingerprint: string | null;
}

/** An unreadable journal kept aside by a restore from the startup screen, never deleted by it. */
interface SetAsideJournal {
  name: string;
  journal: unknown;
}

interface PersistedState {
  version: 1;
  /** The live journal database. */
  journal: JournalSnapshot;
  plan: BackupPlan;
  /** Files in the simulated backup folder; erasing app data never removes them. */
  folder: SimulatedBackup[];
  setAside: SetAsideJournal[];
}

/** What load() read. Unreadable parts are written back unchanged until they are replaced. */
interface Loaded {
  state: PersistedState;
  /** The stored journal when it is not a journal snapshot; undefined when readable. */
  damagedJournal: unknown;
  /** The stored backup plan when it cannot be read; undefined when readable. */
  damagedPlan: unknown;
}

function emptyPlan(): BackupPlan {
  return {
    folderChosen: false,
    lastSuccessDate: null,
    lastSuccessAt: null,
    retentionWarning: false,
    rememberedFingerprint: null,
  };
}

function initialState(): PersistedState {
  return {
    version: 1,
    journal: { entries: [], preferences: { ...DEFAULT_PREFERENCES } },
    plan: emptyPlan(),
    folder: [],
    setAside: [],
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
  return fnv1a(passphrase).toString(16).padStart(8, '0');
}

function validatePassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || Array.from(passphrase).length < PASSPHRASE_MIN_LENGTH) {
    throw failure('passphrase');
  }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Reading the stored state.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJournal(value: unknown): JournalSnapshot | undefined {
  if (!isRecord(value) || !Array.isArray(value.entries) || !isRecord(value.preferences)) return undefined;
  // Preferences stored by an earlier version take the defaults of newer fields.
  return {
    entries: value.entries as StoredEntry[],
    preferences: { ...DEFAULT_PREFERENCES, ...value.preferences } as Preferences,
    weeklyReviews: (value.weeklyReviews ?? {}) as JournalSnapshot['weeklyReviews'],
    milestones: (value.milestones ?? []) as JournalSnapshot['milestones'],
  };
}

const PLAN_KEYS = ['folderChosen', 'lastSuccessDate', 'lastSuccessAt', 'retentionWarning', 'rememberedFingerprint'];

/** Like BackupPlan::load: missing fields take their defaults, anything unknown or mistyped is unreadable. */
function readPlan(value: unknown): BackupPlan | undefined {
  if (value === undefined) return emptyPlan();
  if (!isRecord(value) || Object.keys(value).some((key) => !PLAN_KEYS.includes(key))) return undefined;
  const plan = { ...emptyPlan(), ...value } as Record<string, unknown>;
  const nullable = (field: unknown, type: 'string' | 'number') => field === null || typeof field === type;
  if (
    typeof plan.folderChosen !== 'boolean' ||
    typeof plan.retentionWarning !== 'boolean' ||
    !nullable(plan.lastSuccessDate, 'string') ||
    !nullable(plan.lastSuccessAt, 'number') ||
    !nullable(plan.rememberedFingerprint, 'string')
  ) {
    return undefined;
  }
  return plan as unknown as BackupPlan;
}

function isStoredEntry(item: unknown): item is StoredEntry {
  return isRecord(item) && isRecord(item.entry) && (item.trashedAt === null || typeof item.trashedAt === 'number');
}

/** The journal's entries, or the damaged error when part of the stored journal can't be read. */
function entriesOf(state: PersistedState): StoredEntry[] {
  if (!state.journal.entries.every(isStoredEntry)) throw failure('damaged');
  return state.journal.entries;
}

// ---------------------------------------------------------------------------
// Structural checks: the native command rejects these while deserialising.

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
  'includeInInsights',
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
    includeInInsights: booleanField(input, 'includeInInsights', true),
  };
}

// ---------------------------------------------------------------------------
// Semantic validation, in the order of journal-core's Entry::validate.

const UUID =
  /^(?:urn:uuid:)?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[0-9a-f]{32})$/i;
/** The editor schema's nodes and marks (domain/document.ts); it has no links. */
const DOCUMENT_NODE_TYPES: ReadonlySet<string> = new Set(JOURNAL_NODE_TYPES);
const DOCUMENT_MARK_TYPES: ReadonlySet<string> = new Set(JOURNAL_MARK_TYPES);

/**
 * Mirrors journal-core's validate_node: every node has a node type of the editor schema and every
 * mark a mark type of it (so no links), each text node has non-empty text, `marks` and `content`
 * are arrays, and nesting stays within MAX_DOCUMENT_DEPTH levels. Like it, this checks neither
 * which nodes the schema allows inside which nor attributes, so it does not prove that the editor
 * can show a document exactly: canEditExactly (features/editor/content.ts) guards that fidelity,
 * and the editor opens any other document read-only.
 */
function validateNode(node: unknown, depth: number): void {
  if (depth > MAX_DOCUMENT_DEPTH) throw failure('document');
  if (!isRecord(node) || typeof node.type !== 'string' || !DOCUMENT_NODE_TYPES.has(node.type)) throw failure('document');
  if (node.type === 'text' && (typeof node.text !== 'string' || node.text === '')) throw failure('document');
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) throw failure('document');
    for (const mark of node.marks) {
      if (!isRecord(mark) || typeof mark.type !== 'string' || !DOCUMENT_MARK_TYPES.has(mark.type)) {
        throw failure('document');
      }
    }
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) throw failure('document');
    for (const child of node.content) validateNode(child, depth + 1);
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
  validateNode(entry.document, 1);
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
  if (!THEME_OPTIONS.some((option) => option.id === preferences.theme)) throw failure('document');
  if (!DEPTH_OPTIONS.some((option) => option.id === preferences.defaultDepth)) throw failure('document');
  if (!isTextScale(preferences.textScale)) throw failure('document');
  if (
    !TIMELINE_RANGES.includes(preferences.timelineDays ?? 14) ||
    !Array.isArray(preferences.timelineMetrics) ||
    preferences.timelineMetrics.some((metric) => !SCORE_METRICS.includes(metric))
  ) {
    throw failure('document');
  }
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
  const dataLocation = requested.dataLocation ?? PREVIEW_DATA_LOCATION;
  // A simulated newer journal stays unreadable until a restore or an erase replaces it.
  let simulatedNewerJournal = requested.state === 'unsupported';

  function load(): Loaded {
    let raw: string | null = null;
    try {
      raw = storage.getItem(MEMORY_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return { state: initialState(), damagedJournal: undefined, damagedPlan: undefined };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (!isRecord(parsed) || parsed.version !== 1) {
      // Nothing in the store can be read: neither the journal nor the backup plan.
      return { state: initialState(), damagedJournal: raw, damagedPlan: raw };
    }
    const fresh = initialState();
    const journal = readJournal(parsed.journal);
    const plan = readPlan(parsed.plan);
    return {
      state: {
        version: 1,
        journal: journal ?? fresh.journal,
        plan: plan ?? fresh.plan,
        folder: Array.isArray(parsed.folder) ? (parsed.folder as SimulatedBackup[]) : [],
        setAside: Array.isArray(parsed.setAside) ? (parsed.setAside as SetAsideJournal[]) : [],
      },
      damagedJournal: journal ? undefined : parsed.journal,
      damagedPlan: plan ? undefined : parsed.plan,
    };
  }

  function commit(loaded: Loaded): void {
    const { state, damagedJournal, damagedPlan } = loaded;
    const stored = {
      ...state,
      journal: damagedJournal === undefined ? state.journal : damagedJournal,
      plan: damagedPlan === undefined ? state.plan : damagedPlan,
    };
    try {
      storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      throw failure('storage');
    }
  }

  function startupStatusOf(state: StartupState, message: string | null = null, fromVersion: number | null = null) {
    return { state, fromVersion, message, dataLocation };
  }

  /** Like the native launch: opens the journal and classifies what it found. */
  function openJournal(): StartupStatus {
    if (simulatedNewerJournal) return startupStatusOf('unsupported', ERROR_MESSAGES.unsupported);
    if (load().damagedJournal !== undefined) return startupStatusOf('failed', ERROR_MESSAGES.damaged);
    return startupStatusOf('ready');
  }

  let startup: StartupStatus = requested.state
    ? startupStatusOf(
        requested.state,
        requested.message ??
          (requested.state === 'unsupported'
            ? ERROR_MESSAGES.unsupported
            : requested.state === 'failed'
              ? OPEN_FAILED_MESSAGE
              : null),
        requested.fromVersion ?? (requested.state === 'needsMigration' ? 1 : null),
      )
    : openJournal();

  // Session state: like the native app, a typed passphrase lives only in memory;
  // a remembered one is read back from the simulated Keychain at launch.
  const launched = load();
  let planUnreadable = launched.damagedPlan !== undefined;
  let sessionFingerprint: string | null = launched.state.plan.rememberedFingerprint;
  let lastError: CommandError | null = null;
  let pickedBackup: string | null = null;
  /** The last failed automatic backup, which pauses the daily routine for an hour. */
  let automaticFailureAt: number | null = null;

  function requireReady(): void {
    if (startup.state !== 'ready') throw failure('notReady');
  }

  function journalToday(state: PersistedState): string {
    return todayIn(state.journal.preferences.timeZone, now());
  }

  function statusOf({ state }: Loaded): BackupStatus {
    const { plan } = state;
    let backupState: BackupState;
    if (planUnreadable) backupState = 'settingsUnreadable';
    else if (!plan.folderChosen) backupState = 'needsFolder';
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
      // The simulated Keychain answers at once and never refuses a change, and the simulated
      // backup settings are always saved.
      keychainPending: false,
      keychainWarning: null,
      settingsNotSaved: false,
      lastSuccessDate: plan.lastSuccessDate,
      lastSuccessAt: plan.lastSuccessAt,
      lastError: lastError ? { ...lastError } : null,
      retentionWarning: plan.retentionWarning,
      backupCount: plan.folderChosen ? state.folder.length : 0,
    };
  }

  function folderChosen(state: PersistedState): boolean {
    return !planUnreadable && state.plan.folderChosen;
  }

  /** Publishes a simulated backup of the live journal into the folder. */
  function addBackup(state: PersistedState, passphraseFingerprint: string): void {
    const createdAt = nowUnix();
    const snapshot = copy({ ...state.journal, entries: entriesOf(state) });
    state.folder.push({
      name: `ttd-${createdAt}-${newId()}.ttd.age`,
      createdAt,
      sizeBytes: JSON.stringify(snapshot).length,
      fingerprint: passphraseFingerprint,
      snapshot,
    });
    // Keep the 30 latest, pruning only after the new backup exists, and never the new one.
    state.folder.sort((a, b) => a.createdAt - b.createdAt);
    while (state.folder.length > BACKUPS_KEPT) state.folder.shift();
  }

  /** Backs up, records success only once the result is stored, and tracks failures. */
  function publishBackup(loaded: Loaded, passphraseFingerprint: string): void {
    const { state } = loaded;
    try {
      addBackup(state, passphraseFingerprint);
      state.plan.lastSuccessDate = journalToday(state);
      state.plan.lastSuccessAt = nowUnix();
      state.plan.retentionWarning = false;
      commit(loaded);
    } catch (caught) {
      lastError = isFailure(caught) && caught.code === 'damaged' ? failure('damaged') : failure('backup');
      throw lastError;
    }
    lastError = null;
  }

  function purgeExpired(state: PersistedState): boolean {
    const cutoff = nowUnix() - TRASH_RETENTION_SECONDS;
    const entries = entriesOf(state);
    const kept = entries.filter((item) => item.trashedAt === null || item.trashedAt > cutoff);
    state.journal.entries = kept;
    return kept.length !== entries.length;
  }

  function findActive(state: PersistedState, id: string): StoredEntry | undefined {
    return entriesOf(state).find((item) => item.entry.id === id && item.trashedAt === null);
  }

  function findTrashed(state: PersistedState, id: string): StoredEntry | undefined {
    return entriesOf(state).find((item) => item.entry.id === id && item.trashedAt !== null);
  }

  function slotTaken(state: PersistedState, entry: Entry, exceptId?: string): boolean {
    return entriesOf(state).some(
      (item) =>
        item.trashedAt === null &&
        item.entry.date === entry.date &&
        item.entry.slot === entry.slot &&
        item.entry.id !== exceptId,
    );
  }

  function activeCount(state: PersistedState): number {
    return entriesOf(state).filter((item) => item.trashedAt === null).length;
  }

  function activeEntries(state: PersistedState) {
    requireReady();
    return entriesOf(state).filter((item) => item.trashedAt === null)
      .sort((a,b) => a.entry.date === b.entry.date ? sortBySlot(a,b) : a.entry.date < b.entry.date ? 1 : -1).map((item) => item.entry);
  }

  return {
    async startupStatus() {
      return { ...startup };
    },

    async retryStartup() {
      if (startup.state === 'failed' || startup.state === 'unsupported') startup = openJournal();
      return { ...startup };
    },

    async today() {
      requireReady();
      return journalToday(load().state);
    },

    async getPreferences() {
      requireReady();
      return load().state.journal.preferences;
    },

    async setPreferences(input) {
      requireReady();
      const preferences = normalisePreferences(input);
      const loaded = load();
      loaded.state.journal.preferences = preferences;
      commit(loaded);
      return { ...preferences };
    },

    async entriesOn(date) {
      requireReady();
      if (!isIsoDate(date)) throw failure('date');
      return entriesOf(load().state)
        .filter((item) => item.trashedAt === null && item.entry.date === date)
        .sort(sortBySlot)
        .map((item) => item.entry);
    },

    async listEntries() {
      return activeEntries(load().state);
    },

    async searchEntries(request) { return filterPreviewEntries(activeEntries(load().state), request); },
    async readingReport(request) { return previewReport(activeEntries(load().state), request); },
    async weeklyReview(date) {
      const state = load().state;
      return previewWeek(activeEntries(state), date, state.journal.weeklyReviews?.[isoWeekStart(date)]);
    },
    async saveWeeklyNotes(date, notes, revision) {
      const loaded = load(); const entries = activeEntries(loaded.state); const week = isoWeekStart(date);
      const records = loaded.state.journal.weeklyReviews ??= {};
      const current = records[week] ?? {weekStart:week,notes:'',revision:0,summary:null,fingerprint:null};
      if (revision !== current.revision) throw failure('conflict');
      records[week] = {...current,notes,revision:revision+1};
      // As in journal-core, the reply is built before the commit: a failure writes nothing.
      const review = previewWeek(entries,date,records[week]);
      commit(loaded);
      return review;
    },
    // The summary never checks or advances the notes revision; its fingerprint marks it stale.
    // A week without a stored review starts at revision 1, as in journal-core.
    async generateWeeklySummary(date) {
      const loaded = load(); const entries = activeEntries(loaded.state); const week = isoWeekStart(date);
      const records = loaded.state.journal.weeklyReviews ??= {};
      const current = records[week] ?? {weekStart:week,notes:'',revision:0,summary:null,fingerprint:null};
      const view = previewWeek(entries,date,current);
      records[week] = {...current,revision:Math.max(current.revision,1),summary:localSummary(view.report),fingerprint:previewFingerprint(entries,view.weekStart,view.weekEnd)};
      const review = previewWeek(entries,date,records[week]);
      commit(loaded);
      return review;
    },
    async clearReadingSummaries() {
      requireReady(); const loaded = load();
      for (const review of Object.values(loaded.state.journal.weeklyReviews ?? {})) { review.summary = null; review.fingerprint = null; }
      commit(loaded);
    },
    async listMilestones() { requireReady(); return load().state.journal.milestones ?? []; },
    async saveMilestone(milestone) {
      requireReady();
      if (!isIsoDate(milestone.date)) throw failure('date');
      if (!UUID.test(milestone.id) || !milestone.title.trim()) throw failure('document');
      const loaded = load(); const records = loaded.state.journal.milestones ??= [];
      const current = records.find((m) => m.id === milestone.id);
      if ((current?.revision ?? 0) !== milestone.revision) throw failure('conflict');
      const saved = {...milestone,revision:milestone.revision+1};
      loaded.state.journal.milestones = [...records.filter((m) => m.id !== milestone.id),saved].sort((a,b) => a.date.localeCompare(b.date));
      commit(loaded); return saved;
    },
    async deleteMilestone(id, revision) {
      requireReady(); const loaded = load(); const records = loaded.state.journal.milestones ?? [];
      if (!records.some((m) => m.id === id && m.revision === revision)) throw failure('conflict');
      loaded.state.journal.milestones = records.filter((m) => m.id !== id); commit(loaded);
    },

    async saveEntry(input) {
      requireReady();
      const entry = normaliseEntry(input);
      validateEntry(entry);
      const loaded = load();
      const { state } = loaded;
      const existing = entriesOf(state).find((item) => item.entry.id === entry.id);
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
      commit(loaded);
      return copy(saved);
    },

    async trashEntry(id, revision) {
      requireReady();
      const loaded = load();
      const found = findActive(loaded.state, id);
      if (!found) throw failure('notFound');
      if (found.entry.revision !== revision) throw failure('conflict');
      found.trashedAt = nowUnix();
      commit(loaded);
    },

    async listTrash() {
      requireReady();
      return entriesOf(load().state)
        .filter((item): item is StoredEntry & { trashedAt: number } => item.trashedAt !== null)
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
      const loaded = load();
      const { state } = loaded;
      const found = findTrashed(state, id);
      // Once its 30 days have passed, an entry can't be restored, even before the next purge.
      if (!found || (found.trashedAt ?? 0) <= nowUnix() - TRASH_RETENTION_SECONDS) throw failure('notFound');
      if (slotTaken(state, found.entry)) throw failure('occupied');
      if (found.entry.revision >= MAX_REVISION) throw failure('conflict');
      found.entry = { ...found.entry, revision: found.entry.revision + 1 };
      found.trashedAt = null;
      commit(loaded);
      return copy(found.entry);
    },

    async deleteEntryPermanently(id) {
      requireReady();
      const loaded = load();
      const { state } = loaded;
      const found = findTrashed(state, id);
      if (!found) throw failure('notFound');
      state.journal.entries = entriesOf(state).filter((item) => item !== found);
      commit(loaded);
    },

    async purgeExpiredTrash() {
      requireReady();
      const loaded = load();
      if (purgeExpired(loaded.state)) commit(loaded);
    },

    async backupStatus() {
      return statusOf(load());
    },

    async chooseBackupFolder() {
      const loaded = load();
      // Choosing a folder writes the backup plan again, replacing an unreadable one.
      planUnreadable = false;
      loaded.damagedPlan = undefined;
      loaded.state.plan.folderChosen = true;
      automaticFailureAt = null;
      commit(loaded);
      return statusOf(loaded);
    },

    async setBackupPassphrase(passphrase, remember) {
      validatePassphrase(passphrase);
      const loaded = load();
      sessionFingerprint = fingerprint(passphrase);
      loaded.state.plan.rememberedFingerprint = remember ? sessionFingerprint : null;
      loaded.damagedPlan = undefined;
      lastError = null;
      automaticFailureAt = null;
      commit(loaded);
      return statusOf(loaded);
    },

    async forgetBackupPassphrase() {
      const loaded = load();
      sessionFingerprint = null;
      loaded.state.plan.rememberedFingerprint = null;
      loaded.damagedPlan = undefined;
      commit(loaded);
      return statusOf(loaded);
    },

    async backupNow() {
      requireReady();
      const loaded = load();
      if (!folderChosen(loaded.state)) throw failure('needsFolder');
      if (sessionFingerprint === null) throw failure('needsPassphrase');
      publishBackup(loaded, sessionFingerprint);
      return statusOf(loaded);
    },

    async runDailyBackup() {
      requireReady();
      const loaded = load();
      const { state } = loaded;
      const due = state.plan.lastSuccessDate !== journalToday(state);
      if (!due || !folderChosen(state) || sessionFingerprint === null) return statusOf(loaded);
      // After a failed automatic attempt, wait an hour; Back up now always tries.
      if (automaticFailureAt !== null && nowUnix() - automaticFailureAt < AUTOMATIC_RETRY_SECONDS) {
        return statusOf(loaded);
      }
      try {
        publishBackup(loaded, sessionFingerprint);
      } catch {
        // A failed daily attempt is reported in the status rather than thrown.
        automaticFailureAt = nowUnix();
        return statusOf(load());
      }
      automaticFailureAt = null;
      return statusOf(loaded);
    },

    async listBackups() {
      const { state } = load();
      if (!folderChosen(state)) return [];
      return [...state.folder]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ name, createdAt, sizeBytes }) => ({ name, createdAt, sizeBytes }));
    },

    async chooseRestoreFile() {
      const newest = [...load().state.folder].sort((a, b) => b.createdAt - a.createdAt)[0];
      pickedBackup = newest?.name ?? null;
      return newest ? { name: newest.name } : null;
    },

    async restoreBackup(source: RestoreSource, passphrase, withoutSafetyBackup = false): Promise<RestoreOutcome> {
      const loaded = load();
      const { state } = loaded;
      let name: string | null;
      if (source.kind === 'registered') {
        if (!folderChosen(state)) throw failure('needsFolder');
        name = source.name;
      } else {
        name = pickedBackup;
      }
      // The chosen backup is always verified first: a backup that is gone, or a wrong passphrase, changes nothing.
      const backup = state.folder.find((item) => item.name === name);
      if (!backup) throw failure('backupUnavailable');
      if (typeof passphrase !== 'string' || fingerprint(passphrase) !== backup.fingerprint) {
        throw failure('restore');
      }

      if (startup.state !== 'ready') {
        // No open journal: keep the one that could not be opened or upgraded aside (never deleted)
        // and restore into a fresh one.
        const setAside = `journal.unreadable-${nowUnix()}.sqlite`;
        state.setAside.push({ name: setAside, journal: loaded.damagedJournal ?? copy(state.journal) });
        loaded.damagedJournal = undefined;
        state.journal = copy(backup.snapshot);
        purgeExpired(state);
        commit(loaded);
        simulatedNewerJournal = false;
        startup = startupStatusOf('ready');
        pickedBackup = null;
        return { entries: activeCount(state), safetyBackup: false, setAside };
      }

      let safetyBackup = false;
      if (folderChosen(state) && sessionFingerprint !== null) {
        let entries: StoredEntry[] | null = null;
        try {
          entries = entriesOf(state);
        } catch {
          // The current journal can't be read, so no safety backup of it can be made.
          if (!withoutSafetyBackup) throw failure('safetyBackupFailed');
        }
        if (entries && entries.length > 0) {
          addBackup(state, sessionFingerprint);
          safetyBackup = true;
        }
      }
      state.journal = copy(backup.snapshot);
      purgeExpired(state);
      commit(loaded);
      pickedBackup = null;
      return { entries: activeCount(state), safetyBackup, setAside: null };
    },

    async migrateJournal(passphrase, remember) {
      if (startup.state !== 'needsMigration') return { ...startup };
      const loaded = load();
      if (!folderChosen(loaded.state)) throw failure('needsFolder');
      let print: string;
      if (passphrase === null) {
        // Retrying with the passphrase already in this session never forgets a remembered one.
        if (sessionFingerprint === null) throw failure('needsPassphrase');
        print = sessionFingerprint;
        if (remember) loaded.state.plan.rememberedFingerprint = print;
      } else {
        validatePassphrase(passphrase);
        print = fingerprint(passphrase);
        sessionFingerprint = print;
        loaded.state.plan.rememberedFingerprint = remember ? print : null;
      }
      addBackup(loaded.state, print);
      commit(loaded);
      startup = startupStatusOf('ready');
      return { ...startup };
    },

    async eraseAppData(confirmation) {
      if (confirmation !== ERASE_CONFIRMATION) throw failure('confirmation');
      const { state } = load();
      // Backup files in the chosen folder are not the app's to delete.
      commit({ state: { ...initialState(), folder: state.folder }, damagedJournal: undefined, damagedPlan: undefined });
      sessionFingerprint = null;
      lastError = null;
      pickedBackup = null;
      planUnreadable = false;
      automaticFailureAt = null;
      simulatedNewerJournal = false;
      startup = startupStatusOf('ready');
      return { ...startup };
    },

    onFlushRequest() {
      // A browser has no native quit request to answer.
      return () => {};
    },

    async confirmExit() {},
    async cancelExit() {},
  };
}

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { newDraft } from '../domain/entry';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import { APP_ROOT } from '../guards/sources';
import type { MemoryApiOptions } from './memory';
import {
  createMemoryApi,
  createMemoryStorage,
  DOCUMENT_MARK_TYPES,
  DOCUMENT_NODE_TYPES,
  ERROR_MESSAGES,
  MEMORY_STORAGE_KEY,
  OPEN_FAILED_MESSAGE,
} from './memory';
import type { CommandError, Entry, ErrorCode } from './types';

const DAY_MS = 86_400_000;

function setup(options: MemoryApiOptions = {}) {
  const storage = createMemoryStorage();
  let now = new Date('2026-11-22T09:00:00Z');
  const clock = {
    set(next: Date) {
      now = next;
    },
    advanceDays(days: number) {
      now = new Date(now.getTime() + days * DAY_MS);
    },
    unix: () => Math.floor(now.getTime() / 1000),
  };
  const api = createMemoryApi({ storage, now: () => now, ...options });
  const restart = (extra: MemoryApiOptions = {}) => createMemoryApi({ storage, now: () => now, ...extra });
  return { api, storage, clock, restart };
}

function withText(entry: Entry, text: string): Entry {
  return { ...entry, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } };
}

function draft(date = '2026-11-22', slot: Entry['slot'] = 'morning'): Entry {
  return newDraft(date, slot, 'Europe/Paris', 'daily');
}

function commandError(code: ErrorCode): CommandError {
  return { code, message: ERROR_MESSAGES[code] };
}

describe('memory journal: entries', () => {
  it('acknowledges a new partial draft as revision 1 without inventing scores', async () => {
    const { api } = setup();
    const saved = await api.saveEntry(withText(draft(), 'Synthetic: a quiet start.'));
    expect(saved.revision).toBe(1);
    expect(saved).toMatchObject({ mood: null, energy: null, pride: null, progress: null, complete: false });
    await expect(api.listEntries()).resolves.toEqual([saved]);
  });

  it('restores the exact acknowledged revision after a restart', async () => {
    const { api, restart } = setup();
    // Deliberate multilingual synthetic fixture.
    const text = 'Fictional entry: une journée paisible 🌿 — 静かな朝';
    const saved = await api.saveEntry({
      ...withText(draft(), text),
      mood: 4,
      reflection: { ...draft().reflection, difficulty: 'A long synthetic queue.' },
    });
    const reopened = restart();
    await expect(reopened.listEntries()).resolves.toEqual([saved]);
  });

  it('keeps Morning and Evening observations independent on one date', async () => {
    const { api } = setup();
    const morning = await api.saveEntry({ ...draft('2026-11-22', 'morning'), mood: 2, energy: 3 });
    const evening = await api.saveEntry({ ...draft('2026-11-22', 'evening'), mood: 7, energy: 6 });
    const entries = await api.entriesOn('2026-11-22');
    expect(entries.map((entry) => [entry.slot, entry.mood, entry.energy])).toEqual([
      ['morning', 2, 3],
      ['evening', 7, 6],
    ]);
    expect(entries.map((entry) => entry.id)).toEqual([morning.id, evening.id]);
  });

  it('lets one entry be enough: the other slot stays empty', async () => {
    const { api } = setup();
    await api.saveEntry(draft('2026-11-22', 'evening'));
    const entries = await api.entriesOn('2026-11-22');
    expect(entries).toHaveLength(1);
    expect(entries[0].slot).toBe('evening');
  });

  it('refuses creating an entry in an occupied slot and overwrites nothing', async () => {
    const { api } = setup();
    const first = await api.saveEntry(withText(draft(), 'Synthetic first morning.'));
    await expect(api.saveEntry(withText(draft(), 'Synthetic second morning.'))).rejects.toEqual(
      commandError('occupied'),
    );
    await expect(api.entriesOn('2026-11-22')).resolves.toEqual([first]);
  });

  it('refuses moving an entry onto an occupied slot but allows a free date', async () => {
    const { api } = setup();
    const morning = await api.saveEntry({ ...draft('2026-11-22', 'morning'), mood: 3 });
    const evening = await api.saveEntry({ ...draft('2026-11-22', 'evening'), mood: 8 });
    await expect(api.saveEntry({ ...evening, slot: 'morning' })).rejects.toEqual(commandError('occupied'));
    await expect(api.entriesOn('2026-11-22')).resolves.toEqual([morning, evening]);
    const moved = await api.saveEntry({ ...evening, date: '2026-11-21' });
    expect(moved).toMatchObject({ date: '2026-11-21', slot: 'evening', revision: 2, mood: 8 });
  });

  it('keeps an explicitly chosen earlier date, for example after midnight', async () => {
    const { api, clock } = setup();
    clock.set(new Date('2026-11-22T23:30:00Z')); // 00:30 on 23 November in Paris
    expect(await api.today()).toBe('2026-11-23');
    const saved = await api.saveEntry(draft('2026-11-22', 'evening'));
    clock.advanceDays(1);
    const edited = await api.saveEntry(withText(saved, 'Synthetic late writing.'));
    expect(edited.date).toBe('2026-11-22');
  });

  it('reports a stale revision as a conflict and accepts the acknowledged one', async () => {
    const { api } = setup();
    const saved = await api.saveEntry(draft());
    await expect(api.saveEntry({ ...saved, revision: 0, title: 'Stale' })).rejects.toEqual(commandError('conflict'));
    const next = await api.saveEntry({ ...saved, title: 'Synthetic title' });
    expect(next.revision).toBe(2);
    await expect(api.saveEntry({ ...draft('2026-11-20'), revision: 3 })).rejects.toEqual(commandError('conflict'));
  });

  it('accepts score boundaries as distinct values', async () => {
    const { api } = setup();
    const saved = await api.saveEntry({ ...draft(), mood: 0, energy: 10, pride: 1, progress: 10 });
    expect(saved).toMatchObject({ mood: 0, energy: 10, pride: 1, progress: 10 });
  });

  it.each([
    ['mood 11', { mood: 11 }],
    ['energy -1', { energy: -1 }],
    ['fractional mood', { mood: 7.5 }],
    ['pride 0', { pride: 0 }],
    ['pride 11', { pride: 11 }],
    ['progress 0', { progress: 0 }],
    ['progress 11', { progress: 11 }],
    ['fractional progress', { progress: 2.5 }],
  ])('rejects %s and keeps the saved answers', async (_label, change) => {
    const { api } = setup();
    const saved = await api.saveEntry({ ...draft(), mood: 2, energy: 3, pride: 6, progress: 5 });
    await expect(api.saveEntry({ ...saved, ...change })).rejects.toEqual(commandError('score'));
    await expect(api.listEntries()).resolves.toEqual([saved]);
  });

  it('refuses completion without writing or a required score, keeping the draft', async () => {
    const { api } = setup();
    const saved = await api.saveEntry({ ...draft(), mood: 5, energy: 5 });
    await expect(api.saveEntry({ ...saved, complete: true })).rejects.toEqual(commandError('completion'));
    const blank = withText(saved, '  \n\t ');
    await expect(api.saveEntry({ ...blank, complete: true })).rejects.toEqual(commandError('completion'));
    const noEnergy = { ...withText(saved, 'Synthetic words.'), energy: null };
    await expect(api.saveEntry({ ...noEnergy, complete: true })).rejects.toEqual(commandError('completion'));
    await expect(api.listEntries()).resolves.toEqual([saved]);
  });

  it('completes with writing, mood 0 and energy 10 while pride stays missing', async () => {
    const { api } = setup();
    const saved = await api.saveEntry({ ...withText(draft(), 'Synthetic words.'), mood: 0, energy: 10, complete: true });
    expect(saved).toMatchObject({ complete: true, pride: null, progress: null });
  });

  it('returns a completed entry to draft when its writing is cleared, keeping its check-in', async () => {
    const { api } = setup();
    const complete = await api.saveEntry({
      ...withText(draft(), 'Synthetic words.'),
      mood: 6,
      energy: 4,
      complete: true,
    });
    const cleared = await api.saveEntry({ ...complete, document: { type: 'doc', content: [{ type: 'paragraph' }] } });
    expect(cleared).toMatchObject({ complete: false, mood: 6, energy: 4, revision: 2 });
  });

  it('accepts vocabulary emotions and the person’s own word, and rejects unknown ids', async () => {
    const { api } = setup();
    // Deliberate multilingual synthetic fixture for "Another emotion…".
    const saved = await api.saveEntry({ ...draft(), emotion: 'anxious', anotherEmotion: 'mélancolie douce', energy: 2 });
    expect(saved).toMatchObject({ emotion: 'anxious', anotherEmotion: 'mélancolie douce', energy: 2 });
    await expect(api.saveEntry({ ...saved, emotion: 'invented' })).rejects.toEqual(commandError('emotion'));
  });

  it.each([
    ['duplicate action ids', { actions: [{ id: 'a', text: 'Rest', category: 'rest' }, { id: 'a', text: 'Read', category: 'reading' }] }],
    ['a blank action', { actions: [{ id: 'a', text: '   ', category: '' }] }],
    ['an action without id', { actions: [{ id: '', text: 'Walk', category: 'walking' }] }],
    ['an unknown win origin', { wins: [{ id: 'w', text: 'Synthetic win', origin: 'ai', includeInInsights: true }] }],
    [
      'two pride wins',
      {
        wins: [
          { id: 'w1', text: 'One', origin: 'pride', includeInInsights: true },
          { id: 'w2', text: 'Two', origin: 'pride', includeInInsights: true },
        ],
      },
    ],
    ['a blank win', { wins: [{ id: 'w', text: '', origin: 'manual', includeInInsights: true }] }],
  ])('rejects %s', async (_label, change) => {
    const { api } = setup();
    await expect(api.saveEntry({ ...draft(), ...(change as Partial<Entry>) })).rejects.toEqual(
      commandError('reflection'),
    );
  });

  it('stores several manual wins and one promoted pride win, each with its insight choice', async () => {
    const { api } = setup();
    const saved = await api.saveEntry({
      ...draft(),
      wins: [
        { id: 'w1', text: 'Synthetic: answered one email.', origin: 'manual', includeInInsights: true },
        { id: 'w2', text: 'Synthetic: took a short walk.', origin: 'manual', includeInInsights: false },
        { id: 'w3', text: 'Synthetic: finished a chapter.', origin: 'pride', includeInInsights: true },
      ],
    });
    expect(saved.wins.map((win) => [win.id, win.origin, win.includeInInsights])).toEqual([
      ['w1', 'manual', true],
      ['w2', 'manual', false],
      ['w3', 'pride', true],
    ]);
  });

  it.each([
    ['an impossible date', { date: '2026-02-30' }],
    ['a non-ISO date', { date: '22/11/2026' }],
    ['an unknown creation time zone', { createdTimeZone: 'Mars/Olympus' }],
  ])('rejects %s as a date error', async (_label, change) => {
    const { api } = setup();
    await expect(api.saveEntry({ ...draft(), ...change })).rejects.toEqual(commandError('date'));
  });

  it.each([
    ['an unsupported node', { document: { type: 'doc', content: [{ type: 'image' }] } }],
    [
      'an unsupported mark',
      {
        document: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] }],
        },
      },
    ],
    ['a non-UUID id', { id: 'entry-1' }],
    ['an unknown field', { mood: 3, sneaky: true } as Partial<Entry>],
  ])('rejects %s as a document error', async (_label, change) => {
    const { api } = setup();
    await expect(api.saveEntry({ ...draft(), ...change })).rejects.toEqual(commandError('document'));
  });

  it('accepts the rich-text structure the editor produces', async () => {
    const { api } = setup();
    const document = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Synthetic heading' }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: ' and underlined', marks: [{ type: 'underline' }, { type: 'strike' }, { type: 'code' }] },
          ],
        },
      ],
    };
    await expect(api.saveEntry({ ...draft(), document })).resolves.toMatchObject({ document, revision: 1 });
  });

  it.each([
    [
      'a link mark, which the editor cannot display',
      [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: '#' } }] }] }],
    ],
    ['an empty text node, which the editor cannot load', [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]],
    ['a text node without text', [{ type: 'paragraph', content: [{ type: 'text' }] }]],
  ])('refuses %s and keeps the stored writing', async (_label, content) => {
    const { api } = setup();
    const saved = await api.saveEntry(withText(draft(), 'Synthetic stored words.'));
    await expect(api.saveEntry({ ...saved, document: { type: 'doc', content } })).rejects.toEqual(
      commandError('document'),
    );
    await expect(api.listEntries()).resolves.toEqual([saved]);
  });

  it('accepts exactly the node and mark types journal-core accepts', () => {
    const model = readFileSync(join(APP_ROOT, '../../crates/journal-core/src/model.rs'), 'utf8');
    /** The string literals of a Rust constant such as `const NODE_TYPES: [&str; 11] = [...]`. */
    const constant = (name: string) =>
      Array.from(
        model.match(new RegExp(`const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`))?.[1].matchAll(/"(\w+)"/g) ?? [],
        (match) => match[1],
      );
    const nodes = constant('NODE_TYPES');
    const marks = constant('MARK_TYPES');
    expect(nodes.length).toBeGreaterThan(5);
    expect(marks.length).toBeGreaterThan(3);
    expect(new Set(nodes)).toEqual(DOCUMENT_NODE_TYPES);
    expect(new Set(marks)).toEqual(DOCUMENT_MARK_TYPES);
  });

  it('accepts nesting up to 32 levels and refuses anything deeper', async () => {
    const { api } = setup();
    /** A document of exactly `levels` nested nodes: doc > blockquote… > paragraph > text. */
    const nested = (levels: number) => {
      let node: Entry['document'] = { type: 'text', text: 'Synthetic deep words.' };
      node = { type: 'paragraph', content: [node] };
      for (let level = 3; level < levels; level += 1) node = { type: 'blockquote', content: [node] };
      return { type: 'doc', content: [node] };
    };
    const saved = await api.saveEntry({ ...draft(), document: nested(32) });
    expect(saved.revision).toBe(1);
    await expect(api.saveEntry({ ...saved, document: nested(33) })).rejects.toEqual(commandError('document'));
    await expect(api.listEntries()).resolves.toEqual([saved]);
  });

  it('checks the emotion before the creation time zone, as journal-core does', async () => {
    const { api } = setup();
    await expect(api.saveEntry({ ...draft(), emotion: 'invented', createdTimeZone: 'Mars/Olympus' })).rejects.toEqual(
      commandError('emotion'),
    );
  });

  it('lists active entries newest date first, Morning before Evening', async () => {
    const { api } = setup();
    await api.saveEntry(draft('2026-11-20', 'evening'));
    await api.saveEntry(draft('2026-11-22', 'evening'));
    await api.saveEntry(draft('2026-11-22', 'morning'));
    const list = await api.listEntries();
    expect(list.map((entry) => `${entry.date} ${entry.slot}`)).toEqual([
      '2026-11-22 morning',
      '2026-11-22 evening',
      '2026-11-20 evening',
    ]);
    await expect(api.entriesOn('22 November')).rejects.toEqual(commandError('date'));
  });

  it('reports a storage failure without changing the saved journal', async () => {
    const { api, storage } = setup();
    const saved = await api.saveEntry(draft());
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Synthetic disk full');
    });
    await expect(api.saveEntry(withText(saved, 'Unsaved synthetic words.'))).rejects.toEqual(commandError('storage'));
    vi.restoreAllMocks();
    await expect(api.listEntries()).resolves.toEqual([saved]);
  });
});

// The same queries and fixtures run against native SQLite FTS5 search in
// crates/journal-core/tests/reading.rs; the preview must follow the same rules.
describe('memory journal: search, as native search does', () => {
  it.each(['journee ?', 'paisible 🌿', '« journee »'])(
    'finds the words of "%s" and ignores the punctuation or emoji beside them',
    async (text) => {
      const { api } = setup();
      // Deliberate multilingual synthetic fixture.
      const saved = await api.saveEntry(withText(draft(), 'Synthetic journée paisible 🌿'));
      await expect(api.searchEntries({ text })).resolves.toEqual([saved]);
      const report = await api.readingReport({ text, from: '2026-11-22', to: '2026-11-22' });
      expect([report.entries, report.recordedDays]).toEqual([1, 1]);
    },
  );

  it('still requires every word, and finds nothing for punctuation alone', async () => {
    const { api } = setup();
    // Deliberate multilingual synthetic fixture.
    await api.saveEntry(withText(draft(), 'Synthetic journée paisible 🌿'));
    await expect(api.searchEntries({ text: 'journee ? absent' })).resolves.toEqual([]);
    await expect(api.searchEntries({ text: '?' })).resolves.toEqual([]);
  });

  it('keeps the words of each query part together and folds only Latin accents', async () => {
    const { api } = setup();
    // Deliberate multilingual synthetic fixtures in French and Greek.
    const together = await api.saveEntry(withText(draft('2026-11-21'), 'Synthetic l’amour du matin, καλημέρα'));
    const apart = await api.saveEntry(withText(draft('2026-11-22'), "Synthetic amour de l'été"));
    await expect(api.searchEntries({ text: "l'amour" })).resolves.toEqual([together]);
    await expect(api.searchEntries({ text: 'ete amour' })).resolves.toEqual([apart]);
    await expect(api.searchEntries({ text: 'ΚΑΛΗΜΈΡΑ' })).resolves.toEqual([together]);
    await expect(api.searchEntries({ text: 'καλημερα' })).resolves.toEqual([]);
  });
});

describe('memory journal: trash', () => {
  it('moves an entry to trash for 30 days and hides it from the journal', async () => {
    const { api, clock } = setup();
    const saved = await api.saveEntry(draft());
    await api.trashEntry(saved.id, saved.revision);
    const [item] = await api.listTrash();
    expect(item).toEqual({ entry: saved, deletedAt: clock.unix(), expiresAt: clock.unix() + 30 * 86_400 });
    await expect(api.listEntries()).resolves.toEqual([]);
    await expect(api.entriesOn('2026-11-22')).resolves.toEqual([]);
    await expect(api.saveEntry(saved)).rejects.toEqual(commandError('notFound'));
  });

  it('refuses trashing a stale revision, an unknown entry or one already in trash', async () => {
    const { api } = setup();
    const saved = await api.saveEntry(draft());
    await expect(api.trashEntry(saved.id, 0)).rejects.toEqual(commandError('conflict'));
    await expect(api.trashEntry('00000000-0000-4000-8000-000000000000', 1)).rejects.toEqual(commandError('notFound'));
    await api.trashEntry(saved.id, saved.revision);
    await expect(api.trashEntry(saved.id, saved.revision)).rejects.toEqual(commandError('notFound'));
  });

  it('restores a trashed entry with all its answers when the slot is free', async () => {
    const { api } = setup();
    const saved = await api.saveEntry({
      ...withText(draft(), 'Synthetic words.'),
      mood: 3,
      energy: 4,
      complete: true,
      actions: [{ id: 'a1', text: 'Reading', category: 'reading' }],
    });
    await api.trashEntry(saved.id, saved.revision);
    const restored = await api.restoreEntry(saved.id);
    expect(restored).toEqual({ ...saved, revision: saved.revision + 1 });
    await expect(api.listTrash()).resolves.toEqual([]);
  });

  it('reports an occupied slot on restore without overwriting or purging either entry', async () => {
    const { api } = setup();
    const trashed = await api.saveEntry({ ...draft(), mood: 1 });
    await api.trashEntry(trashed.id, trashed.revision);
    const replacement = await api.saveEntry({ ...draft(), mood: 9 });
    await expect(api.restoreEntry(trashed.id)).rejects.toEqual(commandError('occupied'));
    await expect(api.entriesOn('2026-11-22')).resolves.toEqual([replacement]);
    expect((await api.listTrash()).map((item) => item.entry.id)).toEqual([trashed.id]);
  });

  it('deletes only trashed entries permanently', async () => {
    const { api } = setup();
    const active = await api.saveEntry(draft('2026-11-21'));
    const trashed = await api.saveEntry(draft('2026-11-22'));
    await api.trashEntry(trashed.id, trashed.revision);
    await expect(api.deleteEntryPermanently(active.id)).rejects.toEqual(commandError('notFound'));
    await api.deleteEntryPermanently(trashed.id);
    await expect(api.listTrash()).resolves.toEqual([]);
    await expect(api.restoreEntry(trashed.id)).rejects.toEqual(commandError('notFound'));
  });

  it('purges entries whose 30-day retention has passed, and only those', async () => {
    const { api, clock } = setup();
    const older = await api.saveEntry(draft('2026-11-20'));
    await api.trashEntry(older.id, older.revision);
    clock.advanceDays(1);
    const newer = await api.saveEntry(draft('2026-11-21'));
    await api.trashEntry(newer.id, newer.revision);
    clock.advanceDays(29);
    await api.purgeExpiredTrash();
    expect((await api.listTrash()).map((item) => item.entry.id)).toEqual([newer.id]);
    await expect(api.restoreEntry(older.id)).rejects.toEqual(commandError('notFound'));
  });
});

describe('memory journal: preferences and today', () => {
  it('starts from journal-core’s default preferences', async () => {
    const { api } = setup();
    await expect(api.getPreferences()).resolves.toEqual(DEFAULT_PREFERENCES);
  });

  it('persists preferences across a restart', async () => {
    const { api, restart } = setup();
    const saved = await api.setPreferences({ ...DEFAULT_PREFERENCES, theme: 'dark', gentle: true, defaultDepth: 'quick' });
    expect(saved).toMatchObject({ theme: 'dark', gentle: true, defaultDepth: 'quick' });
    await expect(restart().getPreferences()).resolves.toEqual(saved);
  });

  it.each([
    ['an unknown time zone', { timeZone: 'Atlantis/Capital' }, 'date'],
    ['a lower-case time zone', { timeZone: 'europe/paris' }, 'date'],
    ['a UTC offset', { timeZone: '+01:00' }, 'date'],
    ['an unknown theme', { theme: 'sepia' }, 'document'],
    ['an unknown field', { fontSize: 18 }, 'document'],
  ] as const)('rejects %s and keeps the stored preferences', async (_label, change, code) => {
    const { api } = setup();
    await expect(api.setPreferences({ ...DEFAULT_PREFERENCES, ...change } as never)).rejects.toEqual(
      commandError(code),
    );
    await expect(api.getPreferences()).resolves.toEqual(DEFAULT_PREFERENCES);
  });

  it('computes today in the journal time zone, not the computer’s', async () => {
    const { api, clock } = setup();
    clock.set(new Date('2026-11-22T23:30:00Z'));
    await expect(api.today()).resolves.toBe('2026-11-23');
    await api.setPreferences({ ...DEFAULT_PREFERENCES, timeZone: 'America/New_York' });
    await expect(api.today()).resolves.toBe('2026-11-22');
  });

  it('keeps existing journal dates and slots when the time zone changes', async () => {
    const { api } = setup();
    const saved = await api.saveEntry(draft('2026-11-22', 'evening'));
    await api.setPreferences({ ...DEFAULT_PREFERENCES, timeZone: 'Pacific/Auckland' });
    const [entry] = await api.entriesOn('2026-11-22');
    expect(entry).toEqual(saved);
  });
});

describe('memory journal: startup states', () => {
  it('is ready by default', async () => {
    const { api } = setup();
    await expect(api.startupStatus()).resolves.toMatchObject({ state: 'ready', fromVersion: null, message: null });
  });

  it('pauses a migration until a folder and passphrase protect it, then opens the journal', async () => {
    const { api } = setup({ startup: { state: 'needsMigration' } });
    await expect(api.startupStatus()).resolves.toMatchObject({ state: 'needsMigration', fromVersion: 1 });
    await expect(api.listEntries()).rejects.toEqual(commandError('notReady'));
    await expect(api.migrateJournal('a synthetic passphrase', false)).rejects.toEqual(commandError('needsFolder'));
    await api.chooseBackupFolder();
    await expect(api.migrateJournal('too short', false)).rejects.toEqual(commandError('passphrase'));
    const status = await api.migrateJournal('a synthetic passphrase', false);
    expect(status).toMatchObject({ state: 'ready', fromVersion: null });
    expect(await api.listBackups()).toHaveLength(1);
    await expect(api.listEntries()).resolves.toEqual([]);
  });

  it('describes an unsupported journal and allows erasing app data to start again', async () => {
    const { api } = setup({ startup: { state: 'unsupported' } });
    const status = await api.startupStatus();
    expect(status.message).toBe(ERROR_MESSAGES.unsupported);
    await expect(api.today()).rejects.toEqual(commandError('notReady'));
    await expect(api.eraseAppData('ERASE')).resolves.toMatchObject({ state: 'ready' });
    await expect(api.listEntries()).resolves.toEqual([]);
  });
});

describe('memory journal: backups', () => {
  const PASSPHRASE = 'synthetic passphrase one';

  it('derives the backup state in the documented order', async () => {
    const { api, clock } = setup();
    expect((await api.backupStatus()).state).toBe('needsFolder');
    const withFolder = await api.chooseBackupFolder();
    expect(withFolder).toMatchObject({ state: 'needsPassphrase', folderName: 'Synthetic backups' });
    expect((await api.setBackupPassphrase(PASSPHRASE, false)).state).toBe('due');
    const backedUp = await api.backupNow();
    expect(backedUp).toMatchObject({
      state: 'upToDate',
      lastSuccessDate: '2026-11-22',
      lastSuccessAt: clock.unix(),
      backupCount: 1,
      lastError: null,
    });
    clock.advanceDays(1);
    expect((await api.backupStatus()).state).toBe('due');
  });

  it('requires a passphrase of at least 12 characters', async () => {
    const { api } = setup();
    await expect(api.setBackupPassphrase('eleven char', false)).rejects.toEqual(commandError('passphrase'));
    // Eleven emoji are 22 UTF-16 units but only 11 characters.
    await expect(api.setBackupPassphrase('🔑'.repeat(11), false)).rejects.toEqual(commandError('passphrase'));
    await expect(api.setBackupPassphrase('🔑'.repeat(12), false)).resolves.toMatchObject({ passphraseAvailable: true });
  });

  it('explains what an explicit backup is missing', async () => {
    const { api } = setup();
    await expect(api.backupNow()).rejects.toEqual(commandError('needsFolder'));
    await api.chooseBackupFolder();
    await expect(api.backupNow()).rejects.toEqual(commandError('needsPassphrase'));
  });

  it('backs up once per journal day and catches up on a later launch', async () => {
    const { api, clock, restart } = setup();
    await api.chooseBackupFolder();
    expect((await api.runDailyBackup()).state).toBe('needsPassphrase');
    await api.setBackupPassphrase(PASSPHRASE, true);
    expect((await api.runDailyBackup()).backupCount).toBe(1);
    expect((await api.runDailyBackup()).backupCount).toBe(1);
    clock.advanceDays(3);
    const relaunched = restart();
    const status = await relaunched.runDailyBackup();
    expect(status).toMatchObject({ state: 'upToDate', lastSuccessDate: '2026-11-25', backupCount: 2 });
  });

  it('keeps a typed passphrase for the session only unless it is remembered', async () => {
    const { api, restart } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    expect(await restart().backupStatus()).toMatchObject({ passphraseAvailable: false, remembered: false });
    await api.setBackupPassphrase(PASSPHRASE, true);
    const relaunched = restart();
    expect(await relaunched.backupStatus()).toMatchObject({ passphraseAvailable: true, remembered: true });
    expect(await relaunched.forgetBackupPassphrase()).toMatchObject({ passphraseAvailable: false, remembered: false });
    expect(await restart().backupStatus()).toMatchObject({ passphraseAvailable: false });
  });

  it('never stores the passphrase itself', async () => {
    const { api, storage } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, true);
    await api.backupNow();
    expect(storage.getItem(MEMORY_STORAGE_KEY)).not.toContain(PASSPHRASE);
  });

  it('keeps the 30 latest backups', async () => {
    const { api, clock } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    await api.backupNow();
    const [oldest] = await api.listBackups();
    for (let index = 0; index < 30; index += 1) {
      clock.advanceDays(1);
      await api.backupNow();
    }
    const backups = await api.listBackups();
    expect(backups).toHaveLength(30);
    expect(backups.map((backup) => backup.name)).not.toContain(oldest.name);
    expect(backups[0].createdAt).toBeGreaterThan(backups[29].createdAt);
  });

  it('refuses a wrong passphrase and leaves the current journal unchanged', async () => {
    const { api } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    await api.saveEntry(withText(draft('2026-11-20'), 'Synthetic backed-up entry.'));
    await api.backupNow();
    const [backup] = await api.listBackups();
    const current = await api.saveEntry(withText(draft('2026-11-22'), 'Synthetic newer entry.'));
    const before = await api.listEntries();
    await expect(
      api.restoreBackup({ kind: 'registered', name: backup.name }, 'not the right passphrase'),
    ).rejects.toEqual(commandError('restore'));
    await expect(api.listEntries()).resolves.toEqual(before);
    expect(before.map((entry) => entry.id)).toContain(current.id);
  });

  it('restores entries, dates, slots and answers, after a safety backup of the current journal', async () => {
    const { api } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    const kept = await api.saveEntry({
      ...withText(draft('2026-11-20', 'evening'), 'Synthetic backed-up entry.'),
      mood: 6,
      energy: 2,
      reflection: { ...draft().reflection, helped: 'A synthetic walk.' },
    });
    await api.backupNow();
    const [backup] = await api.listBackups();
    await api.saveEntry(draft('2026-11-22'));
    const outcome = await api.restoreBackup({ kind: 'registered', name: backup.name }, PASSPHRASE);
    expect(outcome).toEqual({ entries: 1, safetyBackup: true, setAside: null });
    await expect(api.listEntries()).resolves.toEqual([kept]);
    expect(await api.listBackups()).toHaveLength(2);
  });

  it('keeps each backup’s original passphrase after the passphrase changes', async () => {
    const { api } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    await api.backupNow();
    const [first] = await api.listBackups();
    await api.setBackupPassphrase('a different synthetic passphrase', false);
    await expect(
      api.restoreBackup({ kind: 'registered', name: first.name }, 'a different synthetic passphrase'),
    ).rejects.toEqual(commandError('restore'));
    await expect(api.restoreBackup({ kind: 'registered', name: first.name }, PASSPHRASE)).resolves.toMatchObject({
      entries: 0,
    });
  });

  it('erases app data on exact confirmation, keeping backup files for a clean restore', async () => {
    const { api } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, true);
    const saved = await api.saveEntry({ ...withText(draft(), 'Synthetic entry to recover.'), mood: 4, energy: 7 });
    await api.backupNow();
    await expect(api.eraseAppData('erase')).rejects.toEqual(commandError('confirmation'));
    await api.eraseAppData('ERASE');
    await expect(api.listEntries()).resolves.toEqual([]);
    expect(await api.backupStatus()).toMatchObject({
      state: 'needsFolder',
      passphraseAvailable: false,
      remembered: false,
      lastSuccessDate: null,
    });
    const picked = await api.chooseRestoreFile();
    expect(picked?.name).toMatch(/^ttd-\d+-[0-9a-f-]+\.ttd\.age$/);
    await expect(api.restoreBackup({ kind: 'picked' }, PASSPHRASE)).resolves.toEqual({
      entries: 1,
      safetyBackup: false,
      setAside: null,
    });
    await expect(api.listEntries()).resolves.toEqual([saved]);
  });

  it('returns null when there is no backup file to pick', async () => {
    const { api } = setup();
    await expect(api.chooseRestoreFile()).resolves.toBeNull();
    await expect(api.restoreBackup({ kind: 'picked' }, PASSPHRASE)).rejects.toEqual(commandError('backupUnavailable'));
  });

  it('reports a backup that is no longer in the folder as unavailable, not as a wrong passphrase', async () => {
    const { api, storage } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    await api.saveEntry(withText(draft('2026-11-20'), 'Synthetic backed-up entry.'));
    await api.backupNow();
    const [backup] = await api.listBackups();
    await api.chooseRestoreFile();
    await api.saveEntry(withText(draft('2026-11-22'), 'Synthetic newer entry.'));
    const before = await api.listEntries();
    // The backup file leaves the folder after it was listed and picked.
    damageStore(storage, (stored) => {
      stored.folder = [];
    });
    for (const source of [{ kind: 'registered', name: backup.name }, { kind: 'picked' }] as const) {
      await expect(api.restoreBackup(source, PASSPHRASE)).rejects.toEqual(commandError('backupUnavailable'));
    }
    await expect(api.listEntries()).resolves.toEqual(before);
  });
});

/** Rewrites part of the stored preview journal, as a damaged file on disk would be. */
function damageStore(storage: Storage, change: (stored: Record<string, unknown>) => void) {
  const stored = JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? 'null') as Record<string, unknown>;
  change(stored);
  storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(stored));
}

const SAFE_PASSPHRASE = 'synthetic passphrase two';

/** A journal with one entry, a chosen folder, a session passphrase and one backup of it. */
async function backedUpJournal(options: MemoryApiOptions = {}) {
  const journal = setup(options);
  const kept = await journal.api.saveEntry({ ...withText(draft('2026-11-20', 'evening'), 'Synthetic backed up.'), mood: 3 });
  await journal.api.chooseBackupFolder();
  await journal.api.setBackupPassphrase(SAFE_PASSPHRASE, false);
  await journal.api.backupNow();
  const [backup] = await journal.api.listBackups();
  return { ...journal, kept, backup };
}

describe('memory journal: messages', () => {
  /** (code, message) pairs written as literals in a Rust source file. */
  function rustMessages(relativePath: string): Array<[string, string]> {
    const path = join(APP_ROOT, relativePath);
    if (!existsSync(path)) return [];
    const source = readFileSync(path, 'utf8');
    const literal = (text: string) => text.replace(/\\\n\s*/g, '').replace(/\\(["'\\])/g, '$1');
    const pairs: Array<[string, string]> = [];
    const codes = new Map(Array.from(source.matchAll(/Self::(\w+)\s*=>\s*"(\w+)"/g), (match) => [match[1], match[2]]));
    for (const match of source.matchAll(/#\[error\(\s*"((?:[^"\\]|\\.)*)"\s*\)\]\s*(\w+)/g)) {
      const code = codes.get(match[2]);
      if (code) pairs.push([code, literal(match[1])]);
    }
    for (const match of source.matchAll(/Self::shell\(\s*"(\w+)",\s*"((?:[^"\\]|\\.)*)",?\s*\)/g)) {
      pairs.push([match[1], literal(match[2])]);
    }
    return pairs;
  }

  it('uses exactly the English messages of journal-core and the native shell', () => {
    // The shell reuses backupFolder for a folder inside the app's own data folder.
    const shellVariants = new Set([`backupFolder:Choose a folder outside the app's own data folder.`]);
    const pairs = [
      ...rustMessages('../../crates/journal-core/src/error.rs'),
      ...rustMessages('src-tauri/src/error.rs'),
    ];
    expect(pairs.length).toBeGreaterThan(15);
    const mismatches = pairs.filter(
      ([code, message]) =>
        !shellVariants.has(`${code}:${message}`) && ERROR_MESSAGES[code as ErrorCode] !== message,
    );
    expect(mismatches).toEqual([]);
  });

  it('defines the messages of the new failure codes', () => {
    expect(ERROR_MESSAGES.damaged).toBe(
      'Part of the journal file is damaged and could not be read. You can restore your journal from a backup.',
    );
    expect(ERROR_MESSAGES.backupRegistry).toBe(
      "This folder's list of backups is damaged or was made by a newer version. Choose a different backup folder; the backups already in it can still be restored with Choose a backup file…",
    );
    expect(ERROR_MESSAGES.backupFolder).toBe(
      "The backup folder is not available or can't be written to. Reconnect the drive or choose another folder.",
    );
    expect(ERROR_MESSAGES.backupUnavailable).toBe(
      'The backup is not available. Reconnect the drive that holds it or choose another backup. Your current journal is unchanged.',
    );
    expect(ERROR_MESSAGES.safetyBackupFailed).toBe(
      'A safety backup of your current journal could not be made, so nothing was restored. If your current journal is damaged, you can restore without a safety backup.',
    );
  });
});

describe('memory journal: text size', () => {
  it('defaults to 100% and loads preferences stored before the setting existed as 100%', async () => {
    const { api, storage, restart } = setup();
    await expect(api.getPreferences()).resolves.toMatchObject({ textScale: 100 });
    await api.setPreferences({ ...DEFAULT_PREFERENCES, theme: 'dark' });
    damageStore(storage, (stored) => {
      delete (stored.journal as { preferences: Record<string, unknown> }).preferences.textScale;
    });
    await expect(restart().getPreferences()).resolves.toMatchObject({ theme: 'dark', textScale: 100 });
  });

  it('accepts 100, 115, 130 and 150% and refuses any other size', async () => {
    const { api } = setup();
    for (const textScale of [115, 130, 150, 100] as const) {
      await expect(api.setPreferences({ ...DEFAULT_PREFERENCES, textScale })).resolves.toMatchObject({ textScale });
    }
    for (const textScale of [0, 90, 120, 200, 115.5]) {
      await expect(api.setPreferences({ ...DEFAULT_PREFERENCES, textScale } as never)).rejects.toEqual(
        commandError('document'),
      );
    }
    await expect(api.setPreferences({ ...DEFAULT_PREFERENCES, textScale: '130' } as never)).rejects.toEqual(
      commandError('document'),
    );
    await expect(api.getPreferences()).resolves.toMatchObject({ textScale: 100 });
  });
});

describe('memory journal: trash expiry', () => {
  it('refuses to restore an entry whose 30 days have passed, even before the next purge', async () => {
    const { api, clock } = setup();
    const saved = await api.saveEntry(draft());
    await api.trashEntry(saved.id, saved.revision);
    clock.advanceDays(30);
    await expect(api.restoreEntry(saved.id)).rejects.toEqual(commandError('notFound'));
    expect(await api.listTrash()).toHaveLength(1);
  });

  it('still restores an entry on its last day in the trash', async () => {
    const { api, clock } = setup();
    const saved = await api.saveEntry(draft());
    await api.trashEntry(saved.id, saved.revision);
    clock.set(new Date(Date.parse('2026-11-22T09:00:00Z') + 30 * DAY_MS - 1000));
    await expect(api.restoreEntry(saved.id)).resolves.toMatchObject({ id: saved.id, revision: 2 });
  });
});

describe('memory journal: startup failures and recovery', () => {
  it('retries a failed start and opens the journal once the cause has gone', async () => {
    const { api } = setup({ startup: { state: 'failed' } });
    await expect(api.startupStatus()).resolves.toMatchObject({ state: 'failed', message: OPEN_FAILED_MESSAGE });
    await expect(api.listEntries()).rejects.toEqual(commandError('notReady'));
    await expect(api.retryStartup()).resolves.toMatchObject({ state: 'ready', message: null });
    await expect(api.listEntries()).resolves.toEqual([]);
  });

  it('returns the current status when there is nothing to retry', async () => {
    const ready = setup();
    await expect(ready.api.retryStartup()).resolves.toMatchObject({ state: 'ready' });
    const migration = setup({ startup: { state: 'needsMigration' } });
    await expect(migration.api.retryStartup()).resolves.toMatchObject({ state: 'needsMigration', fromVersion: 1 });
  });

  it('reports a damaged journal at launch and keeps reporting it when retried', async () => {
    const { api, storage, restart } = setup();
    await api.saveEntry(draft());
    damageStore(storage, (stored) => {
      stored.journal = 'Synthetic damaged journal header';
    });
    const relaunched = restart();
    await expect(relaunched.startupStatus()).resolves.toMatchObject({
      state: 'failed',
      message: ERROR_MESSAGES.damaged,
    });
    await expect(relaunched.retryStartup()).resolves.toMatchObject({ state: 'failed', message: ERROR_MESSAGES.damaged });
  });

  it('restores a damaged journal from a backup file, keeping the unreadable journal aside', async () => {
    const { storage, restart, clock, kept } = await backedUpJournal();
    damageStore(storage, (stored) => {
      stored.journal = 'Synthetic damaged journal header';
    });
    const relaunched = restart();
    await expect(relaunched.startupStatus()).resolves.toMatchObject({ state: 'failed' });
    const picked = await relaunched.chooseRestoreFile();
    expect(picked).not.toBeNull();
    await expect(relaunched.restoreBackup({ kind: 'picked' }, 'not the right passphrase')).rejects.toEqual(
      commandError('restore'),
    );
    await expect(relaunched.startupStatus()).resolves.toMatchObject({ state: 'failed' });

    const outcome = await relaunched.restoreBackup({ kind: 'picked' }, SAFE_PASSPHRASE);
    expect(outcome).toEqual({ entries: 1, safetyBackup: false, setAside: `journal.unreadable-${clock.unix()}.sqlite` });
    await expect(relaunched.startupStatus()).resolves.toMatchObject({ state: 'ready', message: null });
    await expect(relaunched.listEntries()).resolves.toEqual([kept]);
    const stored = JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? '{}') as { setAside: unknown[] };
    expect(stored.setAside).toEqual([{ name: outcome.setAside, journal: 'Synthetic damaged journal header' }]);
    await expect(restart().startupStatus()).resolves.toMatchObject({ state: 'ready' });
  });

  it('restores over a journal this version cannot open, which a retry never opens', async () => {
    const { restart, kept } = await backedUpJournal();
    const relaunched = restart({ startup: { state: 'unsupported' } });
    await expect(relaunched.retryStartup()).resolves.toMatchObject({
      state: 'unsupported',
      message: ERROR_MESSAGES.unsupported,
    });
    await relaunched.chooseRestoreFile();
    const outcome = await relaunched.restoreBackup({ kind: 'picked' }, SAFE_PASSPHRASE);
    expect(outcome.setAside).toMatch(/^journal\.unreadable-\d+\.sqlite$/);
    await expect(relaunched.listEntries()).resolves.toEqual([kept]);
  });

  it('erases app data from a failed start, keeping backup files', async () => {
    const { storage, restart } = await backedUpJournal();
    damageStore(storage, (stored) => {
      stored.journal = 'Synthetic damaged journal header';
    });
    const relaunched = restart();
    await expect(relaunched.eraseAppData('ERASE')).resolves.toMatchObject({ state: 'ready' });
    await expect(relaunched.listEntries()).resolves.toEqual([]);
    await expect(restart().startupStatus()).resolves.toMatchObject({ state: 'ready' });
    expect(await relaunched.chooseRestoreFile()).not.toBeNull();
  });

  it('restores over an older journal that its upgrade cannot back up, keeping it aside', async () => {
    const { storage, restart, clock, kept, backup } = await backedUpJournal();
    damageStore(storage, (stored) => {
      (stored.journal as { entries: unknown[] }).entries.push({ entry: 'Synthetic damaged page', trashedAt: null });
    });
    const storedJournal = () => (JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? '{}') as { journal: unknown }).journal;
    const older = storedJournal();
    const relaunched = restart({ startup: { state: 'needsMigration' } });
    await expect(relaunched.migrateJournal(SAFE_PASSPHRASE, false)).rejects.toEqual(commandError('damaged'));
    await expect(relaunched.startupStatus()).resolves.toMatchObject({ state: 'needsMigration', fromVersion: 1 });
    expect(storedJournal()).toEqual(older);
    await expect(relaunched.listBackups()).resolves.toEqual([backup]);

    const outcome = await relaunched.restoreBackup({ kind: 'registered', name: backup.name }, SAFE_PASSPHRASE);
    expect(outcome).toEqual({ entries: 1, safetyBackup: false, setAside: `journal.unreadable-${clock.unix()}.sqlite` });
    await expect(relaunched.startupStatus()).resolves.toMatchObject({ state: 'ready', fromVersion: null, message: null });
    await expect(relaunched.listEntries()).resolves.toEqual([kept]);
    const stored = JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? '{}') as { setAside: unknown[] };
    expect(stored.setAside).toEqual([{ name: outcome.setAside, journal: older }]);
  });
});

describe('memory journal: a damaged page in an open journal', () => {
  async function partlyDamaged() {
    const journal = await backedUpJournal();
    damageStore(journal.storage, (stored) => {
      (stored.journal as { entries: unknown[] }).entries.push({ entry: 'Synthetic damaged page', trashedAt: null });
    });
    return journal;
  }

  it('reports reads of the damaged journal and refuses backups of it', async () => {
    const { api } = await partlyDamaged();
    await expect(api.listEntries()).rejects.toEqual(commandError('damaged'));
    await expect(api.entriesOn('2026-11-20')).rejects.toEqual(commandError('damaged'));
    await expect(api.backupNow()).rejects.toEqual(commandError('damaged'));
    expect(await api.backupStatus()).toMatchObject({ state: 'upToDate', lastError: commandError('damaged') });
  });

  it('refuses to restore without a safety backup unless the person confirms it', async () => {
    const { api, storage, backup, kept } = await partlyDamaged();
    const before = storage.getItem(MEMORY_STORAGE_KEY);
    await expect(api.restoreBackup({ kind: 'registered', name: backup.name }, SAFE_PASSPHRASE)).rejects.toEqual(
      commandError('safetyBackupFailed'),
    );
    expect(storage.getItem(MEMORY_STORAGE_KEY)).toBe(before);
    // A wrong passphrase is still refused first, even with the confirmation.
    await expect(
      api.restoreBackup({ kind: 'registered', name: backup.name }, 'not the right passphrase', true),
    ).rejects.toEqual(commandError('restore'));

    const outcome = await api.restoreBackup({ kind: 'registered', name: backup.name }, SAFE_PASSPHRASE, true);
    expect(outcome).toEqual({ entries: 1, safetyBackup: false, setAside: null });
    await expect(api.listEntries()).resolves.toEqual([kept]);
    expect(await api.listBackups()).toHaveLength(1);
  });
});

describe('memory journal: unreadable backup settings', () => {
  async function unreadablePlan() {
    const journal = await backedUpJournal();
    damageStore(journal.storage, (stored) => {
      stored.plan = { folderChosen: true, unknownField: 'written by a newer version' };
    });
    return { ...journal, api: journal.restart() };
  }

  it('says the backup settings could not be read instead of treating backups as never set up', async () => {
    const { api, storage, restart } = await unreadablePlan();
    expect(await api.backupStatus()).toMatchObject({
      state: 'settingsUnreadable',
      folderPath: null,
      passphraseAvailable: false,
      remembered: false,
    });
    await expect(api.runDailyBackup()).resolves.toMatchObject({ state: 'settingsUnreadable', backupCount: 0 });
    await expect(api.backupNow()).rejects.toEqual(commandError('needsFolder'));
    // Writing never rewrites the unreadable settings.
    await api.saveEntry(draft('2026-11-22', 'morning'));
    expect(JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? '{}').plan).toEqual({
      folderChosen: true,
      unknownField: 'written by a newer version',
    });
    expect((await restart().backupStatus()).state).toBe('settingsUnreadable');
  });

  it('clears once a backup folder is chosen again; earlier backups are still there', async () => {
    const { api, restart } = await unreadablePlan();
    expect((await api.chooseBackupFolder()).state).toBe('needsPassphrase');
    expect(await api.listBackups()).toHaveLength(1);
    expect((await restart().backupStatus()).state).toBe('needsPassphrase');
  });
});

describe('memory journal: protected upgrade retry', () => {
  it('retries the upgrade with the passphrase already in this session', async () => {
    const { api } = setup({ startup: { state: 'needsMigration' } });
    await api.chooseBackupFolder();
    await expect(api.migrateJournal(null, false)).rejects.toEqual(commandError('needsPassphrase'));
    await api.setBackupPassphrase(PASSPHRASE_FOR_RETRY, true);
    await expect(api.migrateJournal(null, false)).resolves.toMatchObject({ state: 'ready' });
    // A remembered passphrase is never forgotten by a retry.
    expect(await api.backupStatus()).toMatchObject({ remembered: true, passphraseAvailable: true, backupCount: 1 });
  });
});

const PASSPHRASE_FOR_RETRY = 'synthetic passphrase three';

describe('memory journal: daily backup after a failure', () => {
  it('waits an hour after a failed automatic backup, while Back up now still tries', async () => {
    const { api, storage, clock } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE_FOR_RETRY, false);
    const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Synthetic full disk');
    });
    expect(await api.runDailyBackup()).toMatchObject({ state: 'failed', lastError: commandError('backup') });
    const attempts = write.mock.calls.length;
    clock.set(new Date(Date.parse('2026-11-22T09:59:00Z')));
    expect(await api.runDailyBackup()).toMatchObject({ state: 'failed' });
    expect(write.mock.calls.length).toBe(attempts);
    await expect(api.backupNow()).rejects.toEqual(commandError('backup'));
    expect(write.mock.calls.length).toBe(attempts + 1);
    write.mockRestore();
    clock.set(new Date(Date.parse('2026-11-22T10:00:00Z')));
    expect(await api.runDailyBackup()).toMatchObject({ state: 'upToDate', backupCount: 1 });
  });

  it('tries again at once after a new passphrase or folder is chosen', async () => {
    const { api, storage } = setup();
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE_FOR_RETRY, false);
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('Synthetic full disk');
    });
    expect((await api.runDailyBackup()).state).toBe('failed');
    write.mockRestore();
    await api.chooseBackupFolder();
    expect(await api.runDailyBackup()).toMatchObject({ state: 'upToDate', backupCount: 1 });
  });
});

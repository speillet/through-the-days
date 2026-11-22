import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/client';
import { createMemoryApi, createMemoryStorage, ERROR_MESSAGES } from '../api/memory';
import type { CommandError, Entry } from '../api/types';
import { newDraft } from '../domain/entry';
import {
  AUTOSAVE_DELAY_MS,
  discardAllSavers,
  EntrySaver,
  findSaver,
  settleDetachedSavers,
  useEntryAutosave,
  wellFormed,
  wellFormedText,
  type SaverApi,
} from './autosave';
import { flushAll, hasPending } from './flush';
import { StartupProvider, useStartup } from './startup';

const DATE = '2026-11-22';

function text(entry: Entry, value: string): Entry {
  return { ...entry, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] } };
}

function failure(code: CommandError['code']): CommandError {
  return { code, message: ERROR_MESSAGES[code] };
}

/** A journal whose saves wait until the test settles them. */
function controlledJournal() {
  const requests: { entry: Entry; resolve(saved?: Entry): void; reject(error: CommandError): void }[] = [];
  const api: SaverApi = {
    saveEntry: vi.fn(
      (entry: Entry) =>
        new Promise<Entry>((resolve, reject) => {
          requests.push({
            entry,
            resolve: (saved) => resolve(saved ?? { ...entry, revision: entry.revision + 1 }),
            reject,
          });
        }),
    ),
    trashEntry: vi.fn(async () => undefined),
  };
  return { api, requests };
}

function draftFactory() {
  return vi.fn(() => newDraft(DATE, 'morning', 'Europe/Paris', 'daily'));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  discardAllSavers();
  vi.useRealTimers();
});

describe('entry autosave', () => {
  it('saves nothing before the first interaction, then creates the draft once', async () => {
    const { api } = controlledJournal();
    const create = draftFactory();
    const saver = new EntrySaver({ api, initial: null, create });
    expect(saver.getSnapshot()).toMatchObject({ entry: null, state: 'idle' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    expect(api.saveEntry).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    saver.update((entry) => ({ ...entry, mood: 4 }));
    saver.update((entry) => ({ ...entry, energy: 6 }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(saver.getSnapshot()).toMatchObject({ state: 'pending', entry: { mood: 4, energy: 6, revision: 0 } });
  });

  it('ignores a change that returns the same entry, so nothing is created', () => {
    const { api } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => entry);
    expect(saver.getSnapshot()).toMatchObject({ entry: null, state: 'idle' });
  });

  it('waits for a quiet period and sends one save for several edits', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => text(entry, 'Synthetic: a'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    saver.update((entry) => text(entry, 'Synthetic: ab'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    expect(api.saveEntry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(api.saveEntry).toHaveBeenCalledTimes(1);
    expect(saver.getSnapshot().state).toBe('saving');
    requests[0].resolve();
    await settle();
    expect(saver.getSnapshot()).toMatchObject({ state: 'saved', entry: { revision: 1 } });
  });

  it('keeps one save in flight and saves newer edits with the acknowledged revision', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => text(entry, 'Synthetic first words'));
    const flushed = saver.flush();
    await settle();
    expect(requests).toHaveLength(1);
    saver.update((entry) => text(entry, 'Synthetic first words, then more'));
    void saver.flush();
    expect(requests).toHaveLength(1);

    requests[0].resolve();
    await settle();
    expect(requests).toHaveLength(2);
    expect(requests[1].entry.revision).toBe(1);
    expect(requests[1].entry.document).toEqual(text(requests[1].entry, 'Synthetic first words, then more').document);
    requests[1].resolve();
    await expect(flushed).resolves.toBe(true);
    expect(saver.getSnapshot()).toMatchObject({ state: 'saved', entry: { revision: 2 } });
  });

  it('adopts a completion the journal withdrew when the writing was cleared', async () => {
    const { api, requests } = controlledJournal();
    const initial = { ...text(newDraft(DATE, 'evening', 'Europe/Paris'), 'Done'), mood: 5, energy: 5, complete: true, revision: 3 };
    const saver = new EntrySaver({ api, initial, create: draftFactory() });
    saver.update((entry) => text(entry, ''));
    const flushed = saver.flush();
    await settle();
    requests[0].resolve({ ...requests[0].entry, revision: 4, complete: false });
    await expect(flushed).resolves.toBe(true);
    expect(saver.getSnapshot().entry).toMatchObject({ complete: false, revision: 4, mood: 5, energy: 5 });
  });

  it('keeps saving later edits after a flush that found nothing to save', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => ({ ...entry, mood: 6 }));
    await expect(saver.flush()).resolves.toBe(true);
    await expect(saver.flush()).resolves.toBe(true);
    saver.update((entry) => ({ ...entry, energy: 4 }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await settle();
    expect(saver.getSnapshot()).toMatchObject({ state: 'saved', entry: { energy: 4, revision: 2 } });
    saver.update((entry) => ({ ...entry, energy: null }));
    await expect(saver.flush()).resolves.toBe(true);
    expect((await api.entriesOn(DATE))[0]).toMatchObject({ mood: 6, energy: null, revision: 3 });
  });

  it('keeps all local input when a save fails, keeps the failure visible, and retries', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => text(entry, 'Synthetic words that must survive'));
    const first = saver.flush();
    await settle();
    requests[0].reject(failure('storage'));
    await expect(first).resolves.toBe(false);
    expect(saver.getSnapshot()).toMatchObject({
      state: 'failed',
      error: failure('storage'),
      needsReload: false,
      entry: { revision: 0 },
    });
    expect(saver.hasPending()).toBe(true);

    // Typing again retries quietly; the failure stays on screen until a save succeeds.
    saver.update((entry) => text(entry, 'Synthetic words that must survive, still here'));
    expect(saver.getSnapshot().state).toBe('failed');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(saver.getSnapshot().state).toBe('failed');
    requests[1].reject(failure('storage'));
    await settle();

    const retried = saver.saveNow();
    expect(saver.getSnapshot().state).toBe('saving');
    await settle();
    requests[2].resolve();
    await expect(retried).resolves.toBe(true);
    expect(saver.getSnapshot()).toMatchObject({ state: 'saved', error: null, entry: { revision: 1 } });
    expect(saver.hasPending()).toBe(false);
  });

  it('stops retrying after a conflict and asks for a reload instead', async () => {
    const { api, requests } = controlledJournal();
    const initial = { ...newDraft(DATE, 'morning', 'Europe/Paris'), revision: 2 };
    const saver = new EntrySaver({ api, initial, create: draftFactory() });
    saver.update((entry) => ({ ...entry, mood: 3 }));
    const flushed = saver.flush();
    await settle();
    requests[0].reject(failure('conflict'));
    await expect(flushed).resolves.toBe(false);
    expect(saver.getSnapshot()).toMatchObject({ state: 'failed', needsReload: true });
    saver.update((entry) => ({ ...entry, mood: 4 }));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    await expect(saver.saveNow()).resolves.toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('rolls back a refused completion and keeps the draft', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => ({ ...entry, mood: 0, energy: 10 }));
    const refused = await saver.markComplete();
    expect(refused).toEqual(failure('completion'));
    expect(saver.getSnapshot()).toMatchObject({ state: 'saved', entry: { complete: false, revision: 1 } });
    const stored = await api.entriesOn(DATE);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ complete: false, mood: 0, energy: 10, pride: null });

    saver.update((entry) => text(entry, 'Synthetic: enough to finish.'));
    await expect(saver.markComplete()).resolves.toBeNull();
    expect(saver.getSnapshot().entry).toMatchObject({ complete: true, revision: 3, pride: null });
    await expect(saver.markDraft()).resolves.toBeNull();
    expect(saver.getSnapshot().entry).toMatchObject({ complete: false, revision: 4 });
  });

  it('asks for a reload, keeping the draft, when completion is refused because the entry changed elsewhere', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    const stored = await api.saveEntry({ ...text(newDraft(DATE, 'morning', 'Europe/Paris'), 'Synthetic: done.'), mood: 4, energy: 6 });
    await api.saveEntry({ ...stored, mood: 7 });
    const saver = new EntrySaver({ api, initial: stored, create: draftFactory() });
    await expect(saver.markComplete()).resolves.toEqual(failure('conflict'));
    expect(saver.getSnapshot()).toMatchObject({
      state: 'failed',
      error: failure('conflict'),
      needsReload: true,
      entry: { complete: false, revision: 1 },
    });
    expect((await api.entriesOn(DATE))[0]).toMatchObject({ mood: 7, complete: false, revision: 2 });
    // Nothing the person typed is pending, so leaving the entry stays possible.
    expect(saver.hasPending()).toBe(false);
    await expect(saver.flush()).resolves.toBe(true);
  });

  it('asks for a reload when a move is refused because the entry was removed elsewhere', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    const stored = await api.saveEntry({ ...newDraft(DATE, 'morning', 'Europe/Paris'), mood: 2 });
    await api.trashEntry(stored.id, stored.revision);
    const saver = new EntrySaver({ api, initial: stored, create: draftFactory() });
    await expect(saver.move('2026-11-21', 'evening')).resolves.toEqual(failure('notFound'));
    expect(saver.getSnapshot()).toMatchObject({
      state: 'failed',
      needsReload: true,
      entry: { date: DATE, slot: 'morning', revision: 1 },
    });
  });

  it('refuses a move onto an occupied slot and leaves both entries untouched', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    const evening = await api.saveEntry({ ...newDraft(DATE, 'evening', 'Europe/Paris'), mood: 7 });
    const morning = await api.saveEntry({ ...newDraft(DATE, 'morning', 'Europe/Paris'), mood: 2 });
    const saver = new EntrySaver({ api, initial: morning, create: draftFactory() });
    await expect(saver.move(DATE, 'evening')).resolves.toEqual(failure('occupied'));
    expect(saver.getSnapshot()).toMatchObject({ state: 'saved', entry: { slot: 'morning', revision: 1 } });
    expect(await api.entriesOn(DATE)).toEqual([morning, evening]);

    await expect(saver.move('2026-11-21', 'evening')).resolves.toBeNull();
    expect(saver.getSnapshot().entry).toMatchObject({ id: morning.id, date: '2026-11-21', slot: 'evening', mood: 2 });
  });

  it('saves pending input before moving an entry to Trash', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => text(entry, 'Synthetic: to be trashed'));
    await expect(saver.trash()).resolves.toBeNull();
    const trash = await api.listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0].entry.revision).toBe(1);
    expect(await api.entriesOn(DATE)).toEqual([]);
    expect(saver.hasPending()).toBe(false);
  });

  it('lets close and quit wait for unsaved input through the flush registry', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    const release = saver.attach();
    expect(hasPending()).toBe(false);
    saver.update((entry) => text(entry, 'Synthetic: pending at close'));
    expect(hasPending()).toBe(true);
    const flushing = flushAll();
    await settle();
    expect(requests).toHaveLength(1);
    requests[0].resolve();
    await flushing;
    expect(hasPending()).toBe(false);
    release();
  });

  it('keeps unsaved input after its view leaves, until a save succeeds', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    const release = saver.attach();
    saver.update((entry) => text(entry, 'Synthetic: left behind'));
    release();
    await settle();
    expect(requests).toHaveLength(1);
    requests[0].reject(failure('storage'));
    await settle();
    expect(findSaver(DATE, 'morning')).toBe(saver);
    expect(hasPending()).toBe(true);

    const settled = settleDetachedSavers();
    await settle();
    requests[1].resolve();
    await settled;
    await settle();
    expect(findSaver(DATE, 'morning')).toBeUndefined();
    expect(hasPending()).toBe(false);
  });
});

describe('text the journal can store', () => {
  it('replaces lone UTF-16 surrogates with U+FFFD and keeps whole characters', () => {
    expect(wellFormedText('Synthetic \uD83C half')).toBe('Synthetic \uFFFD half');
    expect(wellFormedText('\uDF3F tail first')).toBe('\uFFFD tail first');
    expect(wellFormedText('end \uD83C')).toBe('end \uFFFD');
    // Deliberate multilingual synthetic fixture with whole emoji.
    const whole = 'Une journée calme 🌿☕';
    expect(wellFormedText(whole)).toBe(whole);
    const entry = newDraft(DATE, 'morning', 'Europe/Paris');
    expect(wellFormed(entry)).toBe(entry);
  });

  it('saves well-formed text wherever a lone surrogate was typed or pasted', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    saver.update((entry) => ({
      ...text(entry, 'Synthetic \uD83C words'),
      reflection: { ...entry.reflection, proudOf: 'Proud \uDF3F' },
      wins: [{ id: 'win-1', text: 'Win \uD83C', origin: 'manual', includeInInsights: true }],
      actions: [{ id: 'action-1', text: 'Walk \uDF3F', category: '' }],
      anotherEmotion: 'calme \uD83C',
    }));
    const flushed = saver.flush();
    await settle();
    const sent = requests[0].entry;
    expect(JSON.stringify(sent.document)).toContain('Synthetic \uFFFD words');
    expect(sent.reflection.proudOf).toBe('Proud \uFFFD');
    expect(sent.wins[0].text).toBe('Win \uFFFD');
    expect(sent.actions[0].text).toBe('Walk \uFFFD');
    expect(sent.anotherEmotion).toBe('calme \uFFFD');
    expect(JSON.stringify(sent)).not.toMatch(/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])/i);
    requests[0].resolve();
    await expect(flushed).resolves.toBe(true);
  });

  it('saves well-formed text for an explicit change too', async () => {
    const { api, requests } = controlledJournal();
    const initial = { ...text(newDraft(DATE, 'morning', 'Europe/Paris'), 'Synthetic \uD83C'), mood: 3, energy: 3, revision: 1 };
    const saver = new EntrySaver({ api, initial, create: draftFactory() });
    const completing = saver.markComplete();
    await settle();
    await settle();
    expect(JSON.stringify(requests[0].entry.document)).toContain('Synthetic \uFFFD');
    requests[0].resolve();
    await expect(completing).resolves.toBeNull();
  });
});

describe('acknowledged version', () => {
  it('exposes the version the journal acknowledged, separately from local edits', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    expect(saver.getSnapshot().saved).toBeNull();
    saver.update((entry) => ({ ...entry, mood: 4 }));
    void saver.flush();
    await settle();
    saver.update((entry) => ({ ...entry, energy: 5 }));
    requests[0].resolve();
    await settle();
    expect(saver.getSnapshot().saved).toMatchObject({ mood: 4, energy: null, revision: 1 });
    expect(saver.getSnapshot().entry).toMatchObject({ mood: 4, energy: 5, revision: 1 });
    requests[1].resolve();
    await settle();
    expect(saver.getSnapshot().saved).toMatchObject({ mood: 4, energy: 5, revision: 2 });
  });
});

describe('journal replacement', () => {
  it('drops input that could not be saved when the journal is replaced, so it never reaches the new one', async () => {
    const { api, requests } = controlledJournal();
    const saver = new EntrySaver({ api, initial: null, create: draftFactory() });
    const release = saver.attach();
    saver.update((entry) => text(entry, 'Synthetic: unsaved before erasing'));
    release();
    await settle();
    requests[0].reject(failure('storage'));
    await settle();
    expect(findSaver(DATE, 'morning')).toBe(saver);

    const journal = createMemoryApi({ storage: createMemoryStorage() });
    const { result } = renderHook(() => useStartup(), {
      wrapper: ({ children }: { children?: ReactNode }) =>
        createElement(ApiProvider, { api: journal }, createElement(StartupProvider, null, children)),
    });
    act(() => result.current.reloadJournal('Synthetic: journal replaced.'));
    expect(findSaver(DATE, 'morning')).toBeUndefined();
    expect(hasPending()).toBe(false);
    await expect(saver.flush()).resolves.toBe(true);
    expect(requests).toHaveLength(1);
  });
});

describe('useEntryAutosave', () => {
  function wrapper(api: ReturnType<typeof createMemoryApi>) {
    return ({ children }: { children?: ReactNode }) => createElement(ApiProvider, { api }, children);
  }

  it('flushes when the view unmounts and resumes a failed saver for the same date and slot', async () => {
    vi.useRealTimers();
    const api = createMemoryApi({ storage: createMemoryStorage() });
    let failing = true;
    const flaky = {
      ...api,
      saveEntry: (entry: Entry) => (failing ? Promise.reject(failure('storage')) : api.saveEntry(entry)),
    };
    const options = {
      date: DATE,
      slot: 'morning' as const,
      initial: null,
      create: () => newDraft(DATE, 'morning', 'Europe/Paris'),
      delayMs: 60_000,
    };
    const first = renderHook(() => useEntryAutosave(options), { wrapper: wrapper(flaky) });
    act(() => first.result.current.update((entry) => text(entry, 'Synthetic: kept across views')));
    first.unmount();
    await act(async () => {
      await settleDetachedSavers();
    });

    const second = renderHook(() => useEntryAutosave(options), { wrapper: wrapper(flaky) });
    expect(second.result.current).toMatchObject({ state: 'failed', error: failure('storage') });
    failing = false;
    await act(async () => {
      await second.result.current.saveNow();
    });
    expect(second.result.current.state).toBe('saved');
    const stored = await api.entriesOn(DATE);
    expect(stored[0].document).toEqual(text(stored[0], 'Synthetic: kept across views').document);
    second.unmount();
  });
});

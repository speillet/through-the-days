// Input that is not saved yet stays on screen. Another view, Today opened again or
// another week waits for the open entry or the open week's notes, and a quit or an
// erasure refused for input left out of sight opens it, so a failed save is never kept
// only where nobody sees it. Every record is synthetic.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { JournalApi } from './api/client';
import { ERROR_MESSAGES } from './api/memory';
import { newDraft } from './domain/entry';
import {
  createJournal,
  DATE,
  journalEditor,
  onlyEntry,
  SAVE_TIMEOUT_MS,
  textOf,
  typeInEditor,
  waitForSaved,
} from './features/today/testing';
import { UNSAVED_WRITING_SHOWN_NOT_ERASED } from './features/settings/EraseSection';
import { discardAllSavers, EntrySaver } from './state/autosave';
import { installExitFlush, UNSAVED_WRITING_KEEPS_APP } from './state/exit';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  discardAllSavers();
});

/** The whole app starts and mounts editors here; a busy machine gets as long as for a save. */
const APP_WAIT = { timeout: SAVE_TIMEOUT_MS };

const ENTRY_STAYS = /This entry has changes that are not saved yet, so it stays open and nothing is lost\./;
const NOTES_STAY = /These notes have changes that are not saved yet, so this week stays open and nothing is lost\./;
const THIS_WEEK = 'Monday 16 November 2026 to Sunday 22 November 2026';

/** A journal whose entry and weekly-notes saves fail like a full disk while `failing` is set. */
function flaky(api: JournalApi) {
  const control = { failing: false, refused: 0 };
  function refuse(): Promise<never> {
    control.refused += 1;
    return Promise.reject({ code: 'storage', message: ERROR_MESSAGES.storage });
  }
  const wrapped: JournalApi = {
    ...api,
    saveEntry: (entry) => (control.failing ? refuse() : api.saveEntry(entry)),
    saveWeeklyNotes: (date, notes, revision) =>
      control.failing ? refuse() : api.saveWeeklyNotes(date, notes, revision),
  };
  return { api: wrapped, control };
}

function rail() {
  return screen.getByRole('navigation', { name: 'Main' });
}

function slotTab(name: 'Morning' | 'Evening') {
  return within(screen.getByRole('tablist', { name: 'Entries for this date' })).getByRole('tab', {
    name: new RegExp(`^${name}`),
  });
}

/** Clicks something that leaves the open view, and waits until its unsaved input was tried again. */
async function tryToLeave(user: ReturnType<typeof userEvent.setup>, control: { refused: number }, target: HTMLElement) {
  const refused = control.refused;
  await user.click(target);
  await waitFor(() => expect(control.refused).toBeGreaterThan(refused));
  // The navigation decides once that save has failed.
  await act(async () => {});
}

/** An Evening entry whose save failed after its view had gone: input nobody could see before. */
async function eveningLeftBehind(api: JournalApi, text: string) {
  const saver = new EntrySaver({
    api,
    initial: null,
    create: () => newDraft(DATE, 'evening', 'Europe/Paris'),
    delayMs: 60_000,
  });
  const detach = saver.attach();
  saver.update((entry) => ({
    ...entry,
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  }));
  detach();
  await waitFor(() => expect(saver.getSnapshot().state).toBe('failed'));
}

/** The native quit request, as the Tauri shell sends it, with the app's exit flushing installed. */
function nativeQuit(api: JournalApi) {
  let request: (() => void | Promise<void>) | null = null;
  const native = {
    onFlushRequest: (callback: () => void | Promise<void>) => {
      request = callback;
      return () => {
        request = null;
      };
    },
    confirmExit: vi.fn(async () => {}),
    cancelExit: vi.fn(async () => {}),
  };
  const appWindow = { onCloseRequested: async () => () => {}, destroy: async () => {} };
  cleanups.push(installExitFlush({ ...api, ...native }, appWindow));
  return { ...native, quit: () => act(async () => request?.()) };
}

describe('leaving Today while its entry is not saved', () => {
  it('keeps a failing Evening and its failure on screen for every view, and opens one once it is saved', async () => {
    const user = userEvent.setup();
    const journal = createJournal();
    const { api, control } = flaky(journal.api);
    render(<App api={api} />);
    await user.click(await screen.findByRole('tab', { name: /^Evening/ }, APP_WAIT));
    await screen.findByRole('textbox', { name: /^Evening journal, / }, APP_WAIT);
    control.failing = true;
    await typeInEditor(user, 'Synthetic: long walk by the river.', 'Evening');
    await user.keyboard('{Meta>}s{/Meta}');
    expect(await screen.findByText("Couldn't save")).toBeInTheDocument();

    for (const target of [
      () => within(rail()).getByRole('button', { name: 'Settings' }),
      () => within(rail()).getByRole('button', { name: 'Trash' }),
      () => screen.getByRole('button', { name: 'Set up backups' }),
      () => within(rail()).getByRole('button', { name: 'Calendar' }),
      () => within(rail()).getByRole('button', { name: 'Today' }),
    ]) {
      await tryToLeave(user, control, target());
      expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Sunday 22 November 2026 Today');
      expect(slotTab('Evening')).toHaveAttribute('aria-selected', 'true');
      expect(journalEditor('Evening')).toHaveTextContent('Synthetic: long walk by the river.');
      expect(screen.getByText("Couldn't save")).toBeInTheDocument();
      expect(screen.getByText(ENTRY_STAYS)).toBeInTheDocument();
    }
    expect(await journal.api.entriesOn(DATE)).toEqual([]);

    control.failing = false;
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    await waitForSaved();
    expect(screen.queryByText(ENTRY_STAYS)).not.toBeInTheDocument();
    await user.click(within(rail()).getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    const saved = await onlyEntry(journal.api);
    expect(saved.slot).toBe('evening');
    expect(textOf(saved)).toBe('Synthetic: long walk by the river.');
  });

  it('opens the chosen view as soon as a save that is still running is acknowledged', async () => {
    const user = userEvent.setup();
    const journal = createJournal();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api: JournalApi = {
      ...journal.api,
      saveEntry: async (entry) => {
        await held;
        return journal.api.saveEntry(entry);
      },
    };
    render(<App api={api} />);
    await screen.findByRole('textbox', { name: /^Morning journal, / }, APP_WAIT);
    await typeInEditor(user, 'Synthetic: a slow save.');
    await user.keyboard('{Meta>}s{/Meta}');
    await user.click(within(rail()).getByRole('button', { name: 'Trash' }));
    expect(screen.queryByRole('heading', { level: 1, name: 'Trash' })).not.toBeInTheDocument();
    expect(journalEditor()).toHaveTextContent('Synthetic: a slow save.');

    await act(async () => release());
    expect(await screen.findByRole('heading', { level: 1, name: 'Trash' })).toBeInTheDocument();
    expect(textOf(await onlyEntry(journal.api))).toBe('Synthetic: a slow save.');
  });
});

describe('leaving Weekly Review while its notes are not saved', () => {
  it('keeps the week whose notes failed to save for another week or view, and moves on once they are saved', async () => {
    const user = userEvent.setup();
    const journal = createJournal();
    const { api, control } = flaky(journal.api);
    render(<App api={api} initialView="weekly" />);
    const notes = await screen.findByRole('textbox', { name: 'Your notes' }, APP_WAIT);
    control.failing = true;
    await user.type(notes, 'Synthetic notes for this week.');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(await screen.findByText(ERROR_MESSAGES.storage)).toBeInTheDocument();

    for (const target of [
      () => screen.getByRole('button', { name: 'Previous week' }),
      () => screen.getByRole('button', { name: 'Next week' }),
      () => within(rail()).getByRole('button', { name: 'Today' }),
      () => within(rail()).getByRole('button', { name: 'Settings' }),
    ]) {
      await tryToLeave(user, control, target());
      expect(screen.getByRole('heading', { level: 2, name: THIS_WEEK })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Your notes' })).toHaveValue('Synthetic notes for this week.');
      expect(screen.getByText(ERROR_MESSAGES.storage)).toBeInTheDocument();
      expect(screen.getByText(NOTES_STAY)).toBeInTheDocument();
    }

    control.failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry saving notes' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.queryByText(NOTES_STAY)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Monday 9 November 2026 to Sunday 15 November 2026' }),
    ).toBeInTheDocument();
    expect((await journal.api.weeklyReview(DATE)).notes).toBe('Synthetic notes for this week.');
  });
});

describe('a refused quit or erasure', () => {
  it('opens the Evening entry whose save failed out of sight when erasing is refused for it', async () => {
    const user = userEvent.setup();
    const journal = createJournal();
    const { api, control } = flaky(journal.api);
    control.failing = true;
    await eveningLeftBehind(api, 'Synthetic: an evening left behind.');
    const erase = vi.spyOn(api, 'eraseAppData');
    render(<App api={api} initialView="settings" />);
    await user.click(await screen.findByRole('button', { name: 'Erase all app data…' }, APP_WAIT));
    const dialog = screen.getByRole('alertdialog', { name: 'Erase all app data?' });
    await user.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'ERASE');
    await user.click(within(dialog).getByRole('button', { name: 'Erase all app data' }));

    expect(
      await screen.findByRole('textbox', { name: 'Evening journal, Sunday 22 November 2026' }, APP_WAIT),
    ).toHaveTextContent('Synthetic: an evening left behind.');
    expect(slotTab('Evening')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText("Couldn't save")).toBeInTheDocument();
    expect(screen.getByText(UNSAVED_WRITING_SHOWN_NOT_ERASED)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(erase).not.toHaveBeenCalled();

    control.failing = false;
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    await waitForSaved();
    expect(textOf(await onlyEntry(journal.api))).toBe('Synthetic: an evening left behind.');
  });

  it('opens the week whose notes failed to save when quitting is refused for them', async () => {
    // React also reports the view failure on the console; this test reads the screen.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const journal = createJournal();
    const { api, control } = flaky(journal.api);
    const native = nativeQuit(api);
    render(<App api={api} initialView="weekly" />);
    const notes = await screen.findByRole('textbox', { name: 'Your notes' }, APP_WAIT);
    control.failing = true;
    await user.type(notes, 'Synthetic notes left behind.');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(await screen.findByText(ERROR_MESSAGES.storage)).toBeInTheDocument();

    // Weekly Review fails while reading its sources again, so the notes are out of sight.
    const sources = vi.spyOn(api, 'listEntries').mockImplementation(() => {
      throw new Error('Synthetic view failure');
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByText("This view couldn't be shown.")).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your notes' })).not.toBeInTheDocument();
    sources.mockRestore();

    await native.quit();
    expect(native.confirmExit).not.toHaveBeenCalled();
    expect(native.cancelExit).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { level: 2, name: THIS_WEEK }, APP_WAIT)).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Your notes' })).toHaveValue('Synthetic notes left behind.');
    expect(screen.getByText(ERROR_MESSAGES.storage)).toBeInTheDocument();
    expect(screen.getByText(UNSAVED_WRITING_KEEPS_APP)).toBeInTheDocument();

    control.failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry saving notes' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    await native.quit();
    expect(native.confirmExit).toHaveBeenCalled();
    expect((await journal.api.weeklyReview(DATE)).notes).toBe('Synthetic notes left behind.');
  });
});

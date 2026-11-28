import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../App';
import type { JournalApi } from '../../api/client';
import type { Entry, SearchRequest } from '../../api/types';
import { ERROR_MESSAGES } from '../../api/memory';
import { newDraft } from '../../domain/entry';
import { discardAllSavers } from '../../state/autosave';
import { createTestApi, createTestClock } from '../../test/render';
import {
  createJournal,
  journalEditor,
  onlyEntry,
  renderToday,
  SAVE_TIMEOUT_MS,
  textOf,
  typeInEditor,
} from '../today/testing';

afterEach(() => {
  discardAllSavers();
});

function writing(slot: Entry['slot'], text: string): Entry {
  return {
    ...newDraft('2026-11-22', slot, 'Europe/Paris'),
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  };
}

/**
 * Holds every reading query until the test answers it, as the native app answers only after an
 * IPC round trip. The interface therefore renders each refresh before its result, which the
 * in-memory preview journal (answering within a microtask) never shows.
 */
function heldReads(journal: JournalApi) {
  const held: Array<() => Promise<void>> = [];
  function hold<T>(read: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      held.push(() => read().then(resolve, reject));
    });
  }
  const api: JournalApi = {
    ...journal,
    searchEntries: (request) => hold(() => journal.searchEntries(request)),
    readingReport: (request) => hold(() => journal.readingReport(request)),
    weeklyReview: (date) => hold(() => journal.weeklyReview(date)),
    listEntries: () => hold(() => journal.listEntries()),
    listMilestones: () => hold(() => journal.listMilestones()),
  };
  return {
    api,
    /** Resolves once at least one reading query is waiting for its answer. */
    waiting: () => waitFor(() => expect(held.length).toBeGreaterThan(0)),
    /** Answers every waiting query, then any query those answers start, and renders the results. */
    async answer() {
      while (held.length) {
        await act(async () => {
          await Promise.allSettled(held.splice(0).map((reply) => reply()));
        });
      }
    },
  };
}

/** Lets the first reading queries of a newly rendered view answer. */
async function opened(reads: ReturnType<typeof heldReads>) {
  await reads.waiting();
  await reads.answer();
}

it('does not restore an obsolete search response after the selection has changed', async () => {
  const journal = createTestApi();
  const saved: Entry[] = [];
  for (const [slot, text] of [
    ['morning', 'Synthetic obsolete result.'],
    ['evening', 'Synthetic current result.'],
  ] as const) {
    saved.push(
      await journal.saveEntry({
        ...newDraft('2026-11-22', slot, 'Europe/Paris'),
        document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      }),
    );
  }
  let completeInitial!: (entries: Entry[]) => void;
  const initial = new Promise<Entry[]>((resolve) => {
    completeInitial = resolve;
  });
  const api: JournalApi = {
    ...journal,
    searchEntries: (request) => (request.text ? journal.searchEntries(request) : initial),
  };
  render(<App api={api} initialView="journal" />);
  await userEvent.setup().type(await screen.findByRole('searchbox', { name: 'Search journal' }), 'current');
  expect(await screen.findByText('Synthetic current result.')).toBeInTheDocument();
  await act(async () => {
    completeInitial(saved);
  });
  expect(screen.queryByText('Synthetic obsolete result.')).not.toBeInTheDocument();
  expect(screen.getByText('Synthetic current result.')).toBeInTheDocument();
});

it('saves newer authored notes when a summary finishes after another edit', async () => {
  const journal = createTestApi();
  await journal.saveWeeklyNotes('2026-11-22', 'Synthetic initial notes.', 0);
  let finishSummary!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishSummary = resolve;
  });
  const api: JournalApi = {
    ...journal,
    async generateWeeklySummary(date) {
      const generated = await journal.generateWeeklySummary(date);
      await pending;
      return generated;
    },
  };
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  const notes = await screen.findByRole('textbox', { name: 'Your notes' });
  await user.click(screen.getByRole('button', { name: 'Recalculate local summary' }));
  await waitFor(async () => expect((await journal.weeklyReview('2026-11-22')).summary).not.toBeNull());
  await user.clear(notes);
  await user.type(notes, 'Synthetic newer notes to keep.');
  await user.click(screen.getByRole('button', { name: 'Save notes' }));
  await user.click(screen.getByRole('button', { name: 'Calendar' }));
  await user.click(screen.getByRole('button', { name: 'Weekly Review' }));
  const returnedNotes = await screen.findByRole('textbox', { name: 'Your notes' });
  expect(returnedNotes).toHaveValue('Synthetic newer notes to keep.');
  await act(async () => finishSummary());
  await waitFor(async () =>
    expect((await journal.weeklyReview('2026-11-22')).notes).toBe('Synthetic newer notes to keep.'),
  );
  expect(returnedNotes).toHaveValue('Synthetic newer notes to keep.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('keeps the week, focus and text of notes written while the clock passes into the next week', async () => {
  // 23:58 in Paris on Saturday 28 November 2026.
  const clock = createTestClock(new Date('2026-11-28T22:58:00Z'));
  const api = createTestApi({ now: clock.now });
  // Only the clock's minute refresh is simulated; saves and typing keep real timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    render(<App api={api} initialView="weekly" />);
    const user = userEvent.setup();
    const week = 'Monday 23 November 2026 to Sunday 29 November 2026';
    expect(await screen.findByRole('heading', { name: week })).toBeInTheDocument();
    const notes = screen.getByRole('textbox', { name: 'Your notes' });
    const passMinute = async (next: Date) => {
      clock.set(next);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
    };
    await user.type(notes, 'Synthetic notes begun on Saturday');
    await passMinute(new Date('2026-11-28T23:00:30Z')); // 00:00 on Sunday 29 November, the same week.
    await user.type(notes, ', continued on Sunday');
    await passMinute(new Date('2026-11-29T23:00:30Z')); // 00:00 on Monday 30 November.
    // Today has moved on; waitFor polls with real timers again.
    vi.useRealTimers();
    await user.type(notes, ' and after midnight.');
    const text = 'Synthetic notes begun on Saturday, continued on Sunday and after midnight.';
    expect(screen.getByRole('textbox', { name: 'Your notes' })).toBe(notes);
    expect(notes).toHaveFocus();
    expect(notes).toHaveValue(text);
    expect(screen.getByRole('heading', { name: week })).toBeInTheDocument();
    await waitFor(async () => expect((await api.weeklyReview('2026-11-29')).notes).toBe(text));
    expect((await api.weeklyReview('2026-11-30')).revision).toBe(0);

    // Once the saved notes are left, the review follows today into the new week.
    act(() => notes.blur());
    expect(
      await screen.findByRole('heading', { name: 'Monday 30 November 2026 to Sunday 6 December 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your notes' })).toHaveValue('');
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the shown week while notes the person has left are still saving or failed to save', async () => {
  // 23:58 in Paris on Sunday 29 November 2026.
  const clock = createTestClock(new Date('2026-11-29T22:58:00Z'));
  const journal = createTestApi({ now: clock.now });
  // Notes saves wait until the test releases them, then fail while `failing` is set.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failing = true;
  let saves = 0;
  const api: JournalApi = {
    ...journal,
    async saveWeeklyNotes(date, notes, revision) {
      saves += 1;
      await held;
      if (failing) throw { code: 'storage', message: 'Synthetic notes save failure.' };
      return journal.saveWeeklyNotes(date, notes, revision);
    },
  };
  // Only the clock's minute refresh is simulated; saves and typing keep real timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    render(<App api={api} initialView="weekly" />);
    const user = userEvent.setup();
    const week = 'Monday 23 November 2026 to Sunday 29 November 2026';
    expect(await screen.findByRole('heading', { name: week })).toBeInTheDocument();
    const notes = screen.getByRole('textbox', { name: 'Your notes' });
    const text = 'Synthetic notes written late on Sunday.';
    await user.type(notes, text);
    // Save notes leaves the field; its save is still on its way when the new week begins.
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(saves).toBe(1);
    expect(notes).not.toHaveFocus();
    clock.set(new Date('2026-11-29T23:00:30Z')); // 00:00 on Monday 30 November.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    vi.useRealTimers();
    expect(screen.getByRole('heading', { name: week })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your notes' })).toBe(notes);
    expect(notes).toHaveValue(text);
    expect(screen.getByRole('region', { name: 'Your weekly reflection' })).toHaveTextContent('Saving…');

    // A failed save keeps the week, its notes, the error and the retry on screen.
    await act(async () => release());
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic notes save failure.');
    expect(screen.getByRole('heading', { name: week })).toBeInTheDocument();
    expect(notes).toHaveValue(text);

    // Once a retry saves the notes, the review follows today into the new week.
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry saving notes' }));
    expect(
      await screen.findByRole('heading', { name: 'Monday 30 November 2026 to Sunday 6 December 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your notes' })).toHaveValue('');
    expect((await journal.weeklyReview('2026-11-29')).notes).toBe(text);
    expect((await journal.weeklyReview('2026-11-30')).revision).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('shows the new week with This week while the notes of the week kept on screen are still saving', async () => {
  // 23:58 in Paris on Sunday 29 November 2026.
  const clock = createTestClock(new Date('2026-11-29T22:58:00Z'));
  const journal = createTestApi({ now: clock.now });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api: JournalApi = {
    ...journal,
    async saveWeeklyNotes(date, notes, revision) {
      await held;
      return journal.saveWeeklyNotes(date, notes, revision);
    },
  };
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  const week = 'Monday 23 November 2026 to Sunday 29 November 2026';
  expect(await screen.findByRole('heading', { name: week })).toBeInTheDocument();
  const text = 'Synthetic notes still saving after midnight.';
  await user.type(screen.getByRole('textbox', { name: 'Your notes' }), text);
  await user.click(screen.getByRole('button', { name: 'Save notes' }));
  clock.set(new Date('2026-11-29T23:00:30Z')); // 00:00 on Monday 30 November.
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(screen.getByRole('heading', { name: week })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'This week' }));
  expect(
    await screen.findByRole('heading', { name: 'Monday 30 November 2026 to Sunday 6 December 2026' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Your notes' })).toHaveValue('');
  await act(async () => release());
  await waitFor(async () => expect((await journal.weeklyReview('2026-11-29')).notes).toBe(text));
  expect((await journal.weeklyReview('2026-11-30')).revision).toBe(0);
});

it('reports a weekly source load error and retries without claiming the week is empty', async () => {
  const api = createTestApi();
  await api.saveEntry({
    ...newDraft('2026-11-22', 'morning', 'Europe/Paris'),
    document: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic weekly source.' }] }],
    },
  });
  vi.spyOn(api, 'listEntries').mockRejectedValueOnce({ code: 'storage', message: 'Synthetic source load failure.' });
  render(<App api={api} initialView="weekly" />);
  expect(await screen.findByText(/1 recorded day of 7; 1 saved entry/)).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic source load failure.');
  expect(screen.queryByText(/No recorded entries in this week/)).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry loading sources' }));
  expect(await screen.findByText('Synthetic weekly source.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('keeps saving authored notes when summary generation fails during another edit', async () => {
  const journal = createTestApi();
  await journal.saveWeeklyNotes('2026-11-22', 'Synthetic initial notes.', 0);
  let failSummary!: () => void;
  const pending = new Promise<void>((resolve) => {
    failSummary = resolve;
  });
  const api: JournalApi = {
    ...journal,
    async generateWeeklySummary() {
      await pending;
      throw { code: 'storage', message: 'Synthetic summary failure.' };
    },
  };
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  const notes = await screen.findByRole('textbox', { name: 'Your notes' });
  await user.click(screen.getByRole('button', { name: 'Recalculate local summary' }));
  await user.clear(notes);
  await user.type(notes, 'Synthetic notes despite a failed summary.');
  await act(async () => failSummary());
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic summary failure.');
  await waitFor(async () =>
    expect((await journal.weeklyReview('2026-11-22')).notes).toBe('Synthetic notes despite a failed summary.'),
  );
  expect(notes).toHaveValue('Synthetic notes despite a failed summary.');
  expect(screen.getByRole('button', { name: 'Save notes' })).toBeInTheDocument();
  await user.type(notes, ' More.');
  await user.click(screen.getByRole('button', { name: 'Save notes' }));
  await waitFor(async () =>
    expect((await journal.weeklyReview('2026-11-22')).notes).toBe('Synthetic notes despite a failed summary. More.'),
  );
});

it('keeps the Today timeline in place while an autosave refreshes it', async () => {
  const { api: journal } = createJournal();
  const reads = heldReads(journal);
  await renderToday(reads.api);
  await opened(reads);
  const timeline = screen.getByRole('list', { name: 'Recorded days and gaps' });
  await typeInEditor(userEvent.setup(), 'Synthetic: a slow walk.');
  await waitFor(async () => expect(textOf(await onlyEntry(journal))).toBe('Synthetic: a slow walk.'), {
    timeout: SAVE_TIMEOUT_MS,
  });
  await reads.waiting();
  expect(screen.queryByText('Opening recent days…')).not.toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Recorded days and gaps' })).toBe(timeline);
  await reads.answer();
  expect(screen.getByRole('list', { name: 'Recorded days and gaps' })).toBe(timeline);
  expect(within(timeline).getByTitle('Sunday 22 November 2026')).toHaveTextContent('Morning');
  expect(journalEditor()).toHaveFocus();
});

it('keeps the browsed Calendar month and focus while a window activation refreshes it', async () => {
  const reads = heldReads(createTestApi());
  render(<App api={reads.api} initialView="calendar" />);
  await opened(reads);
  const next = screen.getByRole('button', { name: 'Next month' });
  await userEvent.setup().click(next);
  expect(screen.getByText('December 2026')).toBeInTheDocument();
  fireEvent.focus(window);
  await reads.waiting();
  expect(screen.queryByText('Opening saved entries…')).not.toBeInTheDocument();
  await reads.answer();
  expect(screen.getByText('December 2026')).toBeInTheDocument();
  expect(next).toHaveFocus();
});

it('keeps the browsed Calendar month while a new search or filter loads', async () => {
  const journal = createTestApi();
  await journal.saveEntry(writing('morning', 'Synthetic walk by the river.'));
  const reads = heldReads(journal);
  render(<App api={reads.api} initialView="calendar" />);
  await opened(reads);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Previous month' }));
  await user.click(screen.getByRole('button', { name: 'Previous month' }));
  const grid = screen.getByRole('grid', { name: 'September 2026' });
  await user.type(screen.getByRole('searchbox', { name: 'Search journal' }), 'walk');
  await reads.waiting();
  expect(screen.getByText('Opening saved entries…')).toBeInTheDocument();
  expect(screen.getByRole('grid', { name: 'September 2026' })).toBe(grid);
  await reads.answer();
  expect(screen.getByRole('grid', { name: 'September 2026' })).toBe(grid);
  expect(screen.getByText('Synthetic walk by the river.')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: 'Slot filter' }), { target: { value: 'evening' } });
  await reads.waiting();
  expect(screen.getByRole('grid', { name: 'September 2026' })).toBe(grid);
  await reads.answer();
  expect(screen.getByRole('grid', { name: 'September 2026' })).toBe(grid);
  expect(screen.queryByText('Opening saved entries…')).not.toBeInTheDocument();
  expect(screen.getByText('No saved entry on this date.')).toBeInTheDocument();
});

it('keeps the weekly notes caret and the summary button focused through refreshes', async () => {
  const reads = heldReads(createTestApi());
  render(<App api={reads.api} initialView="weekly" />);
  await opened(reads);
  const user = userEvent.setup();
  const notes = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Your notes' });
  await user.type(notes, 'Synthetic notes in progress.');
  notes.setSelectionRange(9, 9);
  fireEvent.focus(window);
  await reads.waiting();
  expect(screen.queryByText('Opening this week…')).not.toBeInTheDocument();
  await reads.answer();
  expect(screen.getByRole('textbox', { name: 'Your notes' })).toBe(notes);
  expect(notes).toHaveFocus();
  expect(notes).toHaveValue('Synthetic notes in progress.');
  expect(notes.selectionStart).toBe(9);

  const recalculate = screen.getByRole('button', { name: 'Recalculate local summary' });
  await user.click(recalculate);
  await reads.waiting();
  expect(recalculate).toHaveFocus();
  await reads.answer();
  expect(screen.getByText(/^0 recorded days out of 7/)).toBeInTheDocument();
  expect(recalculate).toHaveFocus();
});

it('keeps Book View focus and text selection while a window activation refreshes it', async () => {
  const journal = createTestApi();
  await journal.saveEntry(writing('morning', 'Synthetic passage to select.'));
  const reads = heldReads(journal);
  render(<App api={reads.api} initialView="book" />);
  await opened(reads);
  const page = screen.getByLabelText('Scrollable journal page');
  act(() => page.focus());
  window.getSelection()!.selectAllChildren(screen.getByText('Synthetic passage to select.'));
  fireEvent.focus(window);
  await reads.waiting();
  expect(screen.queryByText('Opening your journal…')).not.toBeInTheDocument();
  await reads.answer();
  expect(screen.getByLabelText('Scrollable journal page')).toBe(page);
  expect(page).toHaveFocus();
  expect(window.getSelection()!.toString()).toBe('Synthetic passage to select.');
});

it('keeps an insights checkbox focused and ignores it until its saved change is shown', async () => {
  const journal = createTestApi();
  const saved = await journal.saveEntry(writing('morning', 'Synthetic source to keep in view.'));
  const save = vi.spyOn(journal, 'saveEntry');
  const reads = heldReads(journal);
  render(<App api={reads.api} initialView="journal" />);
  await opened(reads);
  const user = userEvent.setup();
  const preview = screen.getByRole('region', { name: 'Morning entry from 22 November 2026' });
  const include = within(preview).getByRole('checkbox', { name: 'Include in insights and timelines' });
  await user.click(include);
  await reads.waiting();
  const excluded = { includeInInsights: false, revision: saved.revision + 1 };
  expect(await journal.listEntries()).toMatchObject([excluded]);
  // The requested value shows at once, marked busy, while the refreshed revision is on its way.
  expect(include).not.toBeChecked();
  expect(include).toHaveFocus();
  expect(include).toBeEnabled();
  expect(include).toHaveAttribute('aria-busy', 'true');
  expect(include).toHaveAttribute('aria-disabled', 'true');
  // Until the refreshed revision arrives, another change would be saved over a stale revision.
  await user.click(include);
  expect(include).not.toBeChecked();
  await reads.answer();
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: 'Morning entry from 22 November 2026' })).toBe(preview);
  expect(include).toHaveFocus();
  expect(include).not.toBeChecked();
  expect(include).not.toHaveAttribute('aria-busy');
  expect(include).not.toHaveAttribute('aria-disabled');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await journal.listEntries()).toMatchObject([excluded]);
});

it('shows a failed insights change and accepts the next one', async () => {
  const journal = createTestApi();
  const saved = await journal.saveEntry(writing('morning', 'Synthetic source whose change fails once.'));
  // Installed before heldReads copies the journal's methods, so the interface saves through it.
  const save = vi.spyOn(journal, 'saveEntry').mockRejectedValueOnce({
    code: 'storage',
    message: 'Synthetic toggle failure.',
  });
  const reads = heldReads(journal);
  render(<App api={reads.api} initialView="journal" />);
  await opened(reads);
  const user = userEvent.setup();
  const preview = screen.getByRole('region', { name: 'Morning entry from 22 November 2026' });
  const include = within(preview).getByRole('checkbox', { name: 'Include in insights and timelines' });
  await user.click(include);
  expect(await within(preview).findByRole('alert')).toHaveTextContent('Synthetic toggle failure.');
  // The failed change frees the checkbox at once and shows the saved value again.
  expect(include).toHaveFocus();
  expect(include).toBeChecked();
  expect(include).not.toHaveAttribute('aria-busy');
  expect(include).not.toHaveAttribute('aria-disabled');
  expect(await journal.listEntries()).toMatchObject([{ includeInInsights: true, revision: saved.revision }]);

  await user.click(include);
  expect(save).toHaveBeenCalledTimes(2);
  await reads.waiting();
  expect(within(preview).queryByRole('alert')).not.toBeInTheDocument();
  expect(include).not.toBeChecked();
  expect(include).toHaveAttribute('aria-disabled', 'true');
  await reads.answer();
  expect(screen.getByRole('region', { name: 'Morning entry from 22 November 2026' })).toBe(preview);
  expect(include).toHaveFocus();
  expect(include).not.toBeChecked();
  expect(include).not.toHaveAttribute('aria-disabled');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(await journal.listEntries()).toMatchObject([{ includeInInsights: false, revision: saved.revision + 1 }]);
});

it('keeps The Path So Far sources in place when a milestone is saved', async () => {
  const journal = createTestApi();
  await journal.saveEntry(writing('morning', 'Synthetic path source.'));
  const reads = heldReads(journal);
  render(<App api={reads.api} initialView="path" />);
  await opened(reads);
  const user = userEvent.setup();
  const source = screen.getByRole('region', { name: 'Morning entry from 22 November 2026' });
  await user.click(screen.getByRole('button', { name: 'Add milestone' }));
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Synthetic quiet milestone');
  await user.click(screen.getByRole('button', { name: 'Save milestone' }));
  await reads.waiting();
  expect(screen.queryByText('Opening recorded moments…')).not.toBeInTheDocument();
  await reads.answer();
  expect(screen.getByRole('heading', { name: 'Synthetic quiet milestone' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Morning entry from 22 November 2026' })).toBe(source);
});

it('replaces the shown entries with the error when a refresh fails', async () => {
  const journal = createTestApi();
  await journal.saveEntry(writing('morning', 'Synthetic text before a failed refresh.'));
  const reads = heldReads(journal);
  render(<App api={reads.api} initialView="journal" />);
  await opened(reads);
  vi.spyOn(journal, 'searchEntries').mockRejectedValueOnce({
    code: 'storage',
    message: 'Synthetic refresh failure.',
  });
  fireEvent.focus(window);
  await reads.waiting();
  expect(screen.getByText('Synthetic text before a failed refresh.')).toBeInTheDocument();
  await reads.answer();
  expect(screen.getByRole('alert')).toHaveTextContent('Synthetic refresh failure.');
  expect(screen.queryByText('Synthetic text before a failed refresh.')).not.toBeInTheDocument();
});

it('ignores a minimum score that is not a whole number from 0 to 10 and keeps every reading view working', async () => {
  const journal = createTestApi();
  await journal.saveEntry({ ...writing('morning', 'Synthetic bright morning.'), mood: 8 });
  await journal.saveEntry({ ...writing('evening', 'Synthetic quiet evening.'), mood: 3 });
  // As in the native app: a decimal minimum cannot be read as a command argument, so the request
  // fails before reaching the journal, and the journal refuses a minimum outside 0–10.
  const minimums: unknown[] = [];
  function native<T>(read: (request: SearchRequest) => Promise<T>) {
    return (request: SearchRequest) => {
      minimums.push(request.minimum);
      const minimum = request.minimum;
      if (minimum != null && !Number.isInteger(minimum))
        return Promise.reject('invalid args `request`: invalid type: floating point, expected i32');
      if (minimum != null && (minimum < 0 || minimum > 10))
        return Promise.reject({ code: 'score', message: ERROR_MESSAGES.score });
      return read(request);
    };
  }
  const api: JournalApi = {
    ...journal,
    searchEntries: native((request) => journal.searchEntries(request)),
    readingReport: native((request) => journal.readingReport(request)),
  };
  render(<App api={api} initialView="journal" />);
  const user = userEvent.setup();
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  await user.selectOptions(screen.getByLabelText('Measure'), 'mood');
  const minimum = screen.getByLabelText('Minimum score');
  fireEvent.change(minimum, { target: { value: '7' } });
  await waitFor(() => expect(screen.queryByText('Synthetic quiet evening.')).not.toBeInTheDocument());
  // WebKit keeps a typed 7.5 although it breaks the field's step.
  for (const value of ['7.5', '11', '-1']) {
    fireEvent.change(minimum, { target: { value } });
    expect(minimum).toHaveValue(7);
  }
  expect(await screen.findByText('Synthetic bright morning.')).toBeInTheDocument();
  expect(screen.queryByText('Synthetic quiet evening.')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Trends' }));
  expect(await screen.findByText('Mean 8/10, n=1')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(minimums).toContain(7);
  expect(minimums).not.toContain(7.5);
  expect(minimums).not.toContain(11);
  expect(minimums).not.toContain(-1);

  // Clearing the field still removes the minimum.
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '' } });
  expect(await screen.findByText('Synthetic quiet evening.')).toBeInTheDocument();
});

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from '../../App';
import type { JournalApi } from '../../api/client';
import type { Entry } from '../../api/types';
import { createMemoryApi, createMemoryStorage } from '../../api/memory';
import { newDraft } from '../../domain/entry';

it('does not restore an obsolete search response after the selection has changed', async () => {
  const journal = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
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
  const journal = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  await journal.saveWeeklyNotes('2026-11-22', 'Synthetic initial notes.', 0);
  let finishSummary!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishSummary = resolve;
  });
  const api: JournalApi = {
    ...journal,
    async generateWeeklySummary(date, revision) {
      const generated = await journal.generateWeeklySummary(date, revision);
      await pending;
      return generated;
    },
  };
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  const notes = await screen.findByRole('textbox', { name: 'Your notes' });
  await user.click(screen.getByRole('button', { name: 'Recalculate local summary' }));
  await waitFor(async () => expect((await journal.weeklyReview('2026-11-22')).revision).toBe(2));
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
  let now = new Date('2026-11-28T22:58:00Z');
  const api = createMemoryApi({ storage: createMemoryStorage(), now: () => now });
  // Only the clock's minute refresh is simulated; saves and typing keep real timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  try {
    render(<App api={api} initialView="weekly" />);
    const user = userEvent.setup();
    const week = 'Monday 23 November 2026 to Sunday 29 November 2026';
    expect(await screen.findByRole('heading', { name: week })).toBeInTheDocument();
    const notes = screen.getByRole('textbox', { name: 'Your notes' });
    const passMinute = async (next: Date) => {
      now = next;
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
  let now = new Date('2026-11-29T22:58:00Z');
  const journal = createMemoryApi({ storage: createMemoryStorage(), now: () => now });
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
    now = new Date('2026-11-29T23:00:30Z'); // 00:00 on Monday 30 November.
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

it('reports a weekly source load error and retries without claiming the week is empty', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
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
  const journal = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
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

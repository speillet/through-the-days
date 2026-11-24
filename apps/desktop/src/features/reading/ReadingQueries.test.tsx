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

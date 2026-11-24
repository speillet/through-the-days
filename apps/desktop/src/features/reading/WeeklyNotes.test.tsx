// Weekly notes after a write whose reply was lost, a summary that bumped nothing, and notes
// changed elsewhere: each ends in Saved or in an explicit choice, never in a retry loop that keeps
// close, quit, Restore and Erase waiting.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../../App';
import type { JournalApi } from '../../api/client';
import { createMemoryApi, createMemoryStorage } from '../../api/memory';
import { hasPending } from '../../state/flush';

const WEEK = '2026-11-22';

async function weekJournal(notes?: string) {
  const journal = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  if (notes !== undefined) await journal.saveWeeklyNotes(WEEK, notes, 0);
  return journal;
}

/** Opens Weekly Review and waits for the stored notes to fill the field. */
async function openNotes(api: JournalApi, stored: string) {
  render(<App api={api} initialView="weekly" />);
  const notes = await screen.findByRole('textbox', { name: 'Your notes' });
  await waitFor(() => expect(notes).toHaveValue(stored));
  return notes;
}

function notesStatus() {
  return within(screen.getByRole('region', { name: 'Your weekly reflection' })).getByRole('status');
}

it('reaches Saved after one retry when a notes save was stored but its reply was lost', async () => {
  const journal = await weekJournal('Synthetic notes.');
  let loseReply = true;
  const api: JournalApi = {
    ...journal,
    async saveWeeklyNotes(...args) {
      const saved = await journal.saveWeeklyNotes(...args);
      if (!loseReply) return saved;
      loseReply = false;
      throw { code: 'storage', message: 'Synthetic reply lost after saving.' };
    },
  };
  const notes = await openNotes(api, 'Synthetic notes.');
  const user = userEvent.setup();
  await user.type(notes, ' Kept.');
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic reply lost after saving.');
  expect(await journal.weeklyReview(WEEK)).toMatchObject({ notes: 'Synthetic notes. Kept.', revision: 2 });
  await user.click(screen.getByRole('button', { name: 'Retry saving notes' }));
  await waitFor(() => expect(notesStatus()).toHaveTextContent('Saved'));
  expect(hasPending()).toBe(false);
  expect(await journal.weeklyReview(WEEK)).toMatchObject({ notes: 'Synthetic notes. Kept.', revision: 2 });
});

it('keeps saving notes after a summary that was stored but reported as failed', async () => {
  const journal = await weekJournal('Synthetic notes.');
  const api: JournalApi = {
    ...journal,
    async generateWeeklySummary(...args) {
      await journal.generateWeeklySummary(...args);
      throw { code: 'storage', message: 'Synthetic summary reply lost.' };
    },
  };
  const notes = await openNotes(api, 'Synthetic notes.');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Recalculate local summary' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic summary reply lost.');
  expect((await journal.weeklyReview(WEEK)).summary).not.toBeNull();
  await user.type(notes, ' Kept.');
  await waitFor(async () => expect((await journal.weeklyReview(WEEK)).notes).toBe('Synthetic notes. Kept.'));
  await waitFor(() => expect(notesStatus()).toHaveTextContent('Saved'));
  expect(hasPending()).toBe(false);
});

it('saves notes typed during the first summary of a week without notes', async () => {
  const journal = await weekJournal();
  let finishSummary!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishSummary = resolve;
  });
  const api: JournalApi = {
    ...journal,
    async generateWeeklySummary(...args) {
      const generated = await journal.generateWeeklySummary(...args);
      await pending;
      return generated;
    },
  };
  const notes = await openNotes(api, '');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Recalculate local summary' }));
  await waitFor(async () => expect((await journal.weeklyReview(WEEK)).summary).not.toBeNull());
  await user.type(notes, 'Synthetic first notes.');
  await act(async () => finishSummary());
  await waitFor(async () =>
    expect(await journal.weeklyReview(WEEK)).toMatchObject({ notes: 'Synthetic first notes.', revision: 2 }),
  );
  await waitFor(() => expect(notesStatus()).toHaveTextContent('Saved'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(hasPending()).toBe(false);
});

it('offers a choice when the notes changed elsewhere and saves the kept text over them', async () => {
  const journal = await weekJournal('Synthetic notes.');
  const notes = await openNotes(journal, 'Synthetic notes.');
  const user = userEvent.setup();
  await user.type(notes, ' Mine.');
  await waitFor(() => expect(notesStatus()).toHaveTextContent('Saved'));
  const { revision } = await journal.weeklyReview(WEEK);
  await journal.saveWeeklyNotes(WEEK, 'Synthetic notes from elsewhere.', revision);
  await user.type(notes, ' More.');
  const choice = await screen.findByRole('alert');
  expect(choice).toHaveTextContent('These notes were changed elsewhere');
  expect(notesStatus()).toHaveTextContent('Not saved');
  expect(screen.queryByRole('button', { name: 'Retry saving notes' })).not.toBeInTheDocument();
  expect(notes).toHaveValue('Synthetic notes. Mine. More.');
  expect(hasPending()).toBe(true);
  await user.click(within(choice).getByRole('button', { name: 'Keep my text' }));
  await waitFor(() => expect(notesStatus()).toHaveTextContent('Saved'));
  expect(await journal.weeklyReview(WEEK)).toMatchObject({
    notes: 'Synthetic notes. Mine. More.',
    revision: revision + 2,
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(hasPending()).toBe(false);
});

it('loads the notes saved elsewhere on request and saves later edits on their revision', async () => {
  const journal = await weekJournal('Synthetic notes.');
  const notes = await openNotes(journal, 'Synthetic notes.');
  const user = userEvent.setup();
  await journal.saveWeeklyNotes(WEEK, 'Synthetic notes from elsewhere.', 1);
  await user.type(notes, ' Mine.');
  const choice = await screen.findByRole('alert');
  await user.click(within(choice).getByRole('button', { name: 'Load saved text' }));
  await waitFor(() => expect(notes).toHaveValue('Synthetic notes from elsewhere.'));
  expect(notesStatus()).toHaveTextContent('Saved');
  expect(hasPending()).toBe(false);
  await user.type(notes, ' Added.');
  await waitFor(async () =>
    expect(await journal.weeklyReview(WEEK)).toMatchObject({
      notes: 'Synthetic notes from elsewhere. Added.',
      revision: 3,
    }),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

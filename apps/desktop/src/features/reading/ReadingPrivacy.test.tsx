import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { App } from '../../App';
import type { JournalApi } from '../../api/client';
import { createMemoryApi, createMemoryStorage, ERROR_MESSAGES } from '../../api/memory';
import { documentText, newDraft, newId } from '../../domain/entry';
import { discardAllSavers } from '../../state/autosave';
import { journalEditor, SAVE_TIMEOUT_MS, typeInEditor } from '../today/testing';

afterEach(() => {
  discardAllSavers();
});

it('suspends hidden score filters in Gentle view and restores them without changing the journal', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  const saved = [];
  for (const [slot, mood, text] of [
    ['morning', 2, 'Synthetic quiet morning.'],
    ['evening', 8, 'Synthetic bright evening.'],
  ] as const) {
    saved.push(
      await api.saveEntry({
        ...newDraft('2026-11-22', slot, 'Europe/Paris'),
        mood,
        energy: 5,
        document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      }),
    );
  }
  render(<App api={api} initialView="journal" />);
  const user = userEvent.setup();
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  await user.selectOptions(screen.getByLabelText('Measure'), 'mood');
  fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '8' } });
  await waitFor(() => expect(screen.queryByText('Synthetic quiet morning.')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(await screen.findByRole('switch', { name: 'Gentle view' }));
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  expect(await screen.findByText('Synthetic quiet morning.')).toBeInTheDocument();
  expect(screen.getByText('Synthetic bright evening.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Measure')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Minimum score')).not.toBeInTheDocument();
  expect(screen.queryByText(/2 saved entries/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(await screen.findByRole('switch', { name: 'Gentle view' }));
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  expect(screen.getByLabelText('Measure')).toHaveValue('mood');
  expect(screen.getByLabelText('Minimum score')).toHaveValue(8);
  await waitFor(() => expect(screen.queryByText('Synthetic quiet morning.')).not.toBeInTheDocument());
  for (const entry of saved) expect(await api.getEntry(entry.id)).toEqual(entry);
});

it('keeps a win excluded from insights out of weekly and timeline layers while retaining its original', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  const draft = newDraft('2026-11-22', 'morning', 'Europe/Paris');
  draft.wins = [
    { id: newId(), text: 'Synthetic visible win.', origin: 'manual', includeInInsights: true },
    { id: newId(), text: 'Synthetic excluded win.', origin: 'manual', includeInInsights: false },
  ];
  await api.saveEntry(draft);
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  expect(await screen.findByText(/1 approved small win/)).toBeInTheDocument();
  expect(screen.queryByText('Synthetic excluded win.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'The Path So Far' }));
  expect(await screen.findAllByText('Synthetic visible win.')).not.toHaveLength(0);
  expect(screen.queryByText('Synthetic excluded win.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Calendar' }));
  expect(await screen.findByText('Synthetic excluded win.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Read Morning in Book View' }));
  expect(await screen.findByText('Synthetic excluded win.')).toBeInTheDocument();
});

it('filters timeline sources by included wins without treating an excluded win as insight evidence', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  for (const [slot, includeInInsights, text] of [
    ['morning', false, 'Synthetic source with an excluded win.'],
    ['evening', true, 'Synthetic source with an included win.'],
  ] as const) {
    await api.saveEntry({
      ...newDraft('2026-11-22', slot, 'Europe/Paris'),
      mood: slot === 'morning' ? 8 : 2,
      document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      wins: [{ id: newId(), text: 'Synthetic win.', origin: 'manual', includeInInsights }],
    });
  }
  render(<App api={api} initialView="path" />);
  const user = userEvent.setup();
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  await user.selectOptions(screen.getByLabelText('Small wins'), 'true');
  expect(await screen.findByText('Synthetic source with an included win.')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Opening recorded moments…')).not.toBeInTheDocument());
  expect(screen.queryByText('Synthetic source with an excluded win.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Read Evening in Book View' }));
  expect(await screen.findByRole('article', { name: 'Evening journal entry' })).toHaveTextContent(
    'Synthetic source with an included win.',
  );
  expect(screen.getByRole('button', { name: 'Previous entry' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next entry' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Return to The Path So Far' }));
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  await user.selectOptions(screen.getByLabelText('Small wins'), 'false');
  expect(await screen.findByText('Synthetic source with an excluded win.')).toBeInTheDocument();
  expect(screen.queryByText('Synthetic source with an included win.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Read Morning in Book View' }));
  expect(await screen.findByRole('article', { name: 'Morning journal entry' })).toHaveTextContent(
    'Synthetic source with an excluded win.',
  );
  expect(screen.getByRole('button', { name: 'Next entry' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Return to The Path So Far' }));
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  await user.selectOptions(screen.getByLabelText('Small wins'), 'true');
  await user.click(screen.getByRole('button', { name: 'Trends' }));
  expect(await screen.findByText('Mean 2/10, n=1')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  expect(await screen.findByText('Synthetic source with an excluded win.')).toBeInTheDocument();
});

const WAITING_WRITING = 'Synthetic saved words. Synthetic words written on a full disk.';
/** Today autosaves after its usual pause here; a busy machine gets as long as for a save. */
const APP_WAIT = { timeout: SAVE_TIMEOUT_MS };

/**
 * Writing added to today's saved Morning entry fails to save, as on a full disk, and the person
 * opens Calendar, whose preview still shows the saved version. Saves keep failing until `free()`.
 */
async function writingWaitingInCalendar() {
  const journal = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  const saved = await journal.saveEntry({
    ...newDraft('2026-11-22', 'morning', 'Europe/Paris'),
    document: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic saved words.' }] }],
    },
  });
  const disk = { full: false, refusals: 0 };
  const api: JournalApi = {
    ...journal,
    saveEntry(entry) {
      if (!disk.full) return journal.saveEntry(entry);
      disk.refusals += 1;
      return Promise.reject({ code: 'storage', message: ERROR_MESSAGES.storage });
    },
  };
  render(<App api={api} />);
  const user = userEvent.setup();
  expect(await screen.findByRole('textbox', { name: /^Morning journal, / }, APP_WAIT)).toHaveTextContent(
    'Synthetic saved words.',
  );
  disk.full = true;
  await typeInEditor(user, ' Synthetic words written on a full disk.');
  expect(await screen.findByText("Couldn't save", {}, APP_WAIT)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Calendar' }));
  const preview = await screen.findByRole(
    'region',
    { name: 'Morning entry from 22 November 2026' },
    APP_WAIT,
  );
  // Leaving Today tried once more; the writing still waits for its retry.
  await waitFor(() => expect(disk.refusals).toBe(2), APP_WAIT);
  return {
    journal,
    saved,
    user,
    include: within(preview).getByRole('checkbox', { name: 'Include in insights and timelines' }),
    free: () => {
      disk.full = false;
    },
  };
}

async function openToday(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Today' }),
  );
  await waitFor(() => expect(journalEditor()).toHaveTextContent(WAITING_WRITING), APP_WAIT);
  expect(await screen.findByText('Saved', {}, APP_WAIT)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload saved version' })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
}

it('saves an insights change together with writing whose save failed, so its retry cannot conflict', async () => {
  const { journal, saved, user, include, free } = await writingWaitingInCalendar();
  free();
  await user.click(include);
  await waitFor(
    async () =>
      expect(await journal.getEntry(saved.id)).toMatchObject({ includeInInsights: false, revision: 2 }),
    APP_WAIT,
  );
  expect(documentText((await journal.getEntry(saved.id)).document)).toBe(WAITING_WRITING);
  await openToday(user);
});

it('withdraws an insights change that could not be saved with the waiting writing', async () => {
  const { journal, saved, user, include, free } = await writingWaitingInCalendar();
  await user.click(include);
  const preview = screen.getByRole('region', { name: 'Morning entry from 22 November 2026' });
  expect(await within(preview).findByRole('alert', {}, APP_WAIT)).toHaveTextContent(ERROR_MESSAGES.storage);
  expect(include).toBeChecked();
  expect(await journal.getEntry(saved.id)).toMatchObject({ includeInInsights: true, revision: 1 });

  // Today's retry saves the writing alone: the failed change did not stay behind with it.
  free();
  await openToday(user);
  expect(await journal.getEntry(saved.id)).toMatchObject({ includeInInsights: true, revision: 2 });
  expect(documentText((await journal.getEntry(saved.id)).document)).toBe(WAITING_WRITING);
});

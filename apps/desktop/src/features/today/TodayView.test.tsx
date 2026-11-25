import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalApi } from '../../api/client';
import { ERROR_MESSAGES } from '../../api/memory';
import type { Entry } from '../../api/types';
import { formatLongDate } from '../../domain/dates';
import { newDraft } from '../../domain/entry';
import { discardAllSavers } from '../../state/autosave';
import { PROTECTED_DOCUMENT_MESSAGE } from '../editor/JournalEditor';
import {
  checkedScore,
  chooseScore,
  createJournal,
  DATE,
  goToStage,
  journalEditor,
  onlyEntry,
  renderToday,
  SAVE_TIMEOUT_MS,
  scale,
  setPreferences,
  textOf,
  typeInEditor,
  waitForSaved,
} from './testing';

afterEach(() => {
  discardAllSavers();
});

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function draft(slot: Entry['slot'] = 'morning', date = DATE, text?: string): Entry {
  const entry = newDraft(date, slot, 'Europe/Paris', 'daily');
  return text === undefined ? entry : { ...entry, document: { type: 'doc', content: [paragraph(text)] } };
}

/** A journal whose saves can be made to fail like a full disk. */
function flaky(api: JournalApi) {
  const control = { failing: false };
  const wrapped: JournalApi = {
    ...api,
    saveEntry: (entry) =>
      control.failing ? Promise.reject({ code: 'storage', message: ERROR_MESSAGES.storage }) : api.saveEntry(entry),
  };
  return { api: wrapped, control };
}

function heading() {
  return screen.getByRole('heading', { level: 1 });
}

function slotTab(name: 'Morning' | 'Evening') {
  return within(screen.getByRole('tablist', { name: 'Entries for this date' })).getByRole('tab', {
    name: new RegExp(`^${name}`),
  });
}

async function openSlot(user: ReturnType<typeof userEvent.setup>, name: 'Morning' | 'Evening') {
  await user.click(slotTab(name));
  return screen.findByRole('textbox', { name: new RegExp(`^${name} journal, `) });
}

describe('Today: dates and slots', () => {
  it('opens on today with neutral Morning and Evening statuses and saves nothing before the first interaction', async () => {
    const { api } = createJournal();
    await renderToday(api);
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026 Today');
    expect(slotTab('Morning')).toHaveAttribute('aria-selected', 'true');
    expect(slotTab('Morning')).toHaveTextContent('Not started');
    expect(slotTab('Evening')).toHaveTextContent('Not started');
    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));
    expect(await api.entriesOn(DATE)).toEqual([]);
    expect(document.body.textContent).not.toMatch(/missing|missed|streak|overdue|warning/i);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('keeps Morning 2/3 and Evening 7/6 independent after reopening the app', async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    const first = await renderToday(api);
    await chooseScore(user, 'Mood', 2);
    await chooseScore(user, 'How is my energy?', 3);
    await waitForSaved();
    await openSlot(user, 'Evening');
    expect(slotTab('Morning')).toHaveTextContent('Draft');
    expect(checkedScore('Mood')).toBeNull();
    await chooseScore(user, 'Mood', 7);
    await chooseScore(user, 'How is my energy?', 6);
    await waitForSaved();
    first.unmount();

    const reopened = restart();
    await renderToday(reopened);
    expect(checkedScore('Mood')).toBe(2);
    expect(checkedScore('How is my energy?')).toBe(3);
    await openSlot(user, 'Evening');
    expect(checkedScore('Mood')).toBe(7);
    expect(checkedScore('How is my energy?')).toBe(6);
    const stored = await reopened.entriesOn(DATE);
    expect(stored.map((entry) => [entry.slot, entry.mood, entry.energy])).toEqual([
      ['morning', 2, 3],
      ['evening', 7, 6],
    ]);
  });

  it('keeps the open entry on its chosen date when the clock passes midnight', async () => {
    const user = userEvent.setup();
    // 23:50 in Paris on Sunday 22 November.
    const { api, clock } = createJournal(new Date('2026-11-22T22:50:00Z'));
    await renderToday(api);
    await openSlot(user, 'Evening');
    await typeInEditor(user, 'Synthetic: late thoughts.', 'Evening');
    await waitForSaved();

    clock.set(new Date('2026-11-22T23:10:00Z')); // 00:10 on Monday 23 November.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByRole('button', { name: 'Go to today' })).toBeInTheDocument();
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026');

    await typeInEditor(user, ' Still the same evening.', 'Evening');
    await waitForSaved();
    const entry = await onlyEntry(api, DATE);
    expect(entry.slot).toBe('evening');
    expect(textOf(entry)).toContain('Synthetic: late thoughts. Still the same evening.');
    expect(await api.entriesOn('2026-11-23')).toEqual([]);
  });

  it('moves on to the new date after midnight when nothing is open', async () => {
    const user = userEvent.setup();
    // 23:50 in Paris on Sunday 22 November.
    const { api, clock } = createJournal(new Date('2026-11-22T22:50:00Z'));
    await renderToday(api);
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026 Today');
    await user.click(screen.getByRole('button', { name: 'Write directly' }));
    expect(journalEditor()).toHaveFocus();

    clock.set(new Date('2026-11-22T23:10:00Z')); // 00:10 on Monday 23 November.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Monday 23 November 2026 Today' })).toBeInTheDocument();
    const monday = await screen.findByRole('textbox', { name: 'Morning journal, Monday 23 November 2026' });
    // The writing keeps the focus it had.
    await waitFor(() => expect(monday).toHaveFocus());
    await typeInEditor(user, 'Synthetic: the first words of Monday.');
    await waitForSaved();
    expect(await onlyEntry(api, '2026-11-23')).toMatchObject({ slot: 'morning', date: '2026-11-23' });
    expect(await api.entriesOn(DATE)).toEqual([]);
  });

  it('opens an empty slot on the new date after midnight, while the entry left open keeps its date', async () => {
    const user = userEvent.setup();
    // 22:00 in Paris on Sunday 22 November.
    const { api, clock } = createJournal(new Date('2026-11-22T21:00:00Z'));
    await renderToday(api);
    await openSlot(user, 'Evening');
    await typeInEditor(user, 'Synthetic: the evening before.', 'Evening');
    await waitForSaved();

    clock.set(new Date('2026-11-23T07:00:00Z')); // 08:00 on Monday 23 November.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByRole('button', { name: 'Go to today' })).toBeInTheDocument();
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026');

    await user.click(slotTab('Morning'));
    expect(await screen.findByRole('textbox', { name: 'Morning journal, Monday 23 November 2026' })).toBeInTheDocument();
    expect(heading()).toHaveAccessibleName('Monday 23 November 2026 Today');
    await typeInEditor(user, 'Synthetic: Monday morning.');
    await waitForSaved();
    expect(await onlyEntry(api, '2026-11-23')).toMatchObject({ slot: 'morning' });
    expect(await onlyEntry(api, DATE)).toMatchObject({ slot: 'evening' });
  });

  it("opens the earlier day's own entry after midnight when that slot already has one", async () => {
    const user = userEvent.setup();
    const { api, clock } = createJournal(new Date('2026-11-22T21:00:00Z'));
    await api.saveEntry(draft('morning', DATE, 'Synthetic: Sunday morning.'));
    await renderToday(api);
    await openSlot(user, 'Evening');
    await typeInEditor(user, 'Synthetic: Sunday evening.', 'Evening');
    await waitForSaved();

    clock.set(new Date('2026-11-23T07:00:00Z'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await screen.findByRole('button', { name: 'Go to today' });
    await user.click(slotTab('Morning'));
    expect(await screen.findByRole('textbox', { name: 'Morning journal, Sunday 22 November 2026' })).toHaveTextContent(
      'Synthetic: Sunday morning.',
    );
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026');
  });

  it('keeps a date the person chose when the clock passes midnight', async () => {
    const user = userEvent.setup();
    const { api, clock } = createJournal(new Date('2026-11-22T22:50:00Z'));
    await renderToday(api);
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByRole('heading', { level: 1, name: 'Saturday 21 November 2026' });

    clock.set(new Date('2026-11-22T23:10:00Z'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await screen.findByRole('textbox', { name: 'Morning journal, Saturday 21 November 2026' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(heading()).toHaveAccessibleName('Saturday 21 November 2026');
    await openSlot(user, 'Evening');
    expect(journalEditor('Evening')).toHaveAccessibleName('Evening journal, Saturday 21 November 2026');
  });

  it('writes into the previous date when the person chooses it after midnight', async () => {
    const user = userEvent.setup();
    // 00:30 in Paris on Monday 23 November.
    const { api } = createJournal(new Date('2026-11-22T23:30:00Z'));
    await renderToday(api);
    expect(heading()).toHaveAccessibleName('Monday 23 November 2026 Today');
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByRole('heading', { level: 1, name: 'Sunday 22 November 2026' });
    await openSlot(user, 'Evening');
    await typeInEditor(user, 'Synthetic: written after midnight about the evening before.', 'Evening');
    await waitForSaved();
    expect((await onlyEntry(api, DATE)).slot).toBe('evening');
    expect(await api.entriesOn('2026-11-23')).toEqual([]);
  });

  it('moves between days with Previous day, Next day and Go to today', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Saturday 21 November 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    await user.click(await screen.findByRole('button', { name: 'Next day' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Monday 23 November 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to today' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sunday 22 November 2026 Today' })).toBeInTheDocument();
  });

  it('chooses a date from a Monday-first picker with the keyboard and restores focus on Escape', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    const trigger = screen.getByRole('button', { name: 'Choose date' });
    await user.click(trigger);
    const picker = screen.getByRole('dialog', { name: 'Choose a journal date' });
    const grid = within(picker).getByRole('grid', { name: 'November 2026' });
    expect(within(grid).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'MonMonday',
      'TueTuesday',
      'WedWednesday',
      'ThuThursday',
      'FriFriday',
      'SatSaturday',
      'SunSunday',
    ]);
    expect(within(picker).getByRole('button', { name: 'Sunday 22 November 2026, today' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(within(picker).getByRole('button', { name: 'Saturday 21 November 2026' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(within(picker).getByRole('button', { name: 'Saturday 14 November 2026' })).toHaveFocus();
    await user.keyboard('{PageUp}');
    expect(within(picker).getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: formatLongDate('2026-10-14') })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Choose a journal date' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026 Today');

    await user.click(trigger);
    await user.keyboard('{ArrowLeft}{ArrowLeft}{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday 20 November 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose date' })).toHaveFocus();
  });

  it('switches slots with the arrow keys', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    slotTab('Morning').focus();
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('textbox', { name: /^Evening journal, / })).toBeInTheDocument();
    expect(slotTab('Evening')).toHaveFocus();
    expect(slotTab('Evening')).toHaveAttribute('aria-selected', 'true');
  });

  it('reopens a slot on its saved version after switching away, and saves the next edit on top of it', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await typeInEditor(user, 'Synthetic morning words.');
    await waitForSaved();
    await openSlot(user, 'Evening');
    await openSlot(user, 'Morning');
    expect(journalEditor()).toHaveTextContent('Synthetic morning words.');
    expect(slotTab('Morning')).toHaveTextContent('Draft');

    const savedRevision = (await onlyEntry(api)).revision;
    await typeInEditor(user, ' More.');
    await waitFor(async () => {
      const saved = await onlyEntry(api);
      expect(saved.revision).toBeGreaterThan(savedRevision);
      expect(textOf(saved)).toBe('Synthetic morning words. More.');
    }, { timeout: SAVE_TIMEOUT_MS });
    await waitForSaved();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textOf(await onlyEntry(api))).toBe('Synthetic morning words. More.');
  });

  it('keeps a score changed before switching slots and saves later answers with it', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await api.saveEntry({ ...draft('morning'), mood: 2 });
    await renderToday(api);
    await chooseScore(user, 'Mood', 8);
    await waitFor(async () => expect(await onlyEntry(api)).toMatchObject({ mood: 8, revision: 2 }), {
      timeout: SAVE_TIMEOUT_MS,
    });
    await openSlot(user, 'Evening');
    await openSlot(user, 'Morning');
    expect(checkedScore('Mood')).toBe(8);

    await chooseScore(user, 'How is my energy?', 4);
    await waitFor(async () => expect(await onlyEntry(api)).toMatchObject({ mood: 8, energy: 4, revision: 3 }), {
      timeout: SAVE_TIMEOUT_MS,
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/stays open/)).not.toBeInTheDocument();
  });
});

describe('Today: completion', () => {
  it('refuses completion without writing or a required score, explaining why and keeping the draft', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await chooseScore(user, 'Mood', 6);
    await chooseScore(user, 'How is my energy?', 4);
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(
      await screen.findByText('To mark this entry complete, add some writing. It stays a draft until then, with everything kept.'),
    ).toBeInTheDocument();
    expect(await onlyEntry(api)).toMatchObject({ complete: false, mood: 6, energy: 4 });

    await typeInEditor(user, 'Synthetic: some words.');
    await user.click(screen.getByRole('button', { name: 'Clear energy' }));
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(await screen.findByText(/^To mark this entry complete, add an energy score\./)).toBeInTheDocument();
    const entry = await onlyEntry(api);
    expect(entry).toMatchObject({ complete: false, mood: 6, energy: null });
    expect(textOf(entry)).toContain('Synthetic: some words.');
    expect(slotTab('Morning')).toHaveTextContent('Draft');
  });

  it('completes an entry with writing, mood 0 and energy 10 while pride stays missing', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await chooseScore(user, 'Mood', 0);
    await chooseScore(user, 'How is my energy?', 10);
    await typeInEditor(user, 'Synthetic: a heavy day, written down.');
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(await screen.findByRole('button', { name: 'Mark as draft' })).toBeInTheDocument();
    expect(slotTab('Morning')).toHaveTextContent('Complete');
    expect(await onlyEntry(api)).toMatchObject({ complete: true, mood: 0, energy: 10, pride: null, progress: null });

    await user.click(screen.getByRole('button', { name: 'Mark as draft' }));
    expect(await screen.findByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
    expect(await onlyEntry(api)).toMatchObject({ complete: false, mood: 0, energy: 10 });
  });

  it('returns a completed entry to draft when its writing is cleared, keeping its answers', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await api.saveEntry({
      ...draft('morning', DATE, 'Synthetic: a finished entry.'),
      mood: 5,
      energy: 6,
      complete: true,
      reflection: { ...draft().reflection, difficulty: 'Synthetic: a missed fictional train.' },
    });
    await renderToday(api);
    expect(slotTab('Morning')).toHaveTextContent('Complete');
    await user.click(journalEditor());
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await waitForSaved();
    expect(await screen.findByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
    expect(slotTab('Morning')).toHaveTextContent('Draft');
    const entry = await onlyEntry(api);
    expect(entry).toMatchObject({ complete: false, mood: 5, energy: 6 });
    expect(entry.reflection.difficulty).toBe('Synthetic: a missed fictional train.');
    expect(textOf(entry).trim()).toBe('');
  });

  it('offers to reload the saved version when completion is refused because the entry changed elsewhere', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    const saved = await api.saveEntry({ ...draft('morning', DATE, 'Synthetic: ready to finish.'), mood: 5, energy: 5 });
    await renderToday(api);
    await api.saveEntry({ ...saved, mood: 6 });
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.conflict);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Reload saved version' }));
    await waitFor(() => expect(checkedScore('Mood')).toBe(6));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await onlyEntry(api)).toMatchObject({ mood: 6, complete: false, revision: 2 });
  });
});

describe('Today: saving', () => {
  it('restores a writing-only draft without inventing scores', async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    const first = await renderToday(api);
    await typeInEditor(user, 'Synthetic: only words today.');
    await waitForSaved();
    first.unmount();

    await renderToday(restart());
    expect(journalEditor()).toHaveTextContent('Synthetic: only words today.');
    expect(slotTab('Morning')).toHaveTextContent('Draft');
    expect(checkedScore('Mood')).toBeNull();
    expect(checkedScore('How is my energy?')).toBeNull();
    expect(await onlyEntry(restart())).toMatchObject({ mood: null, energy: null, pride: null, progress: null });
  });

  it("shows Couldn't save, keeps the writing, and saves it on Try again", async () => {
    const user = userEvent.setup();
    const journal = createJournal();
    const { api, control } = flaky(journal.api);
    await renderToday(api);
    control.failing = true;
    await typeInEditor(user, 'Synthetic: words that must not be lost.');
    expect(await screen.findByText("Couldn't save")).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.storage);
    expect(alert).toHaveTextContent('Your writing stays on this page until it is saved.');
    expect(journalEditor()).toHaveTextContent('Synthetic: words that must not be lost.');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(await journal.api.entriesOn(DATE)).toEqual([]);

    control.failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitForSaved();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textOf(await onlyEntry(journal.api))).toContain('Synthetic: words that must not be lost.');
  });

  it('keeps the entry open instead of switching slots while a save is failing', async () => {
    const user = userEvent.setup();
    const journal = createJournal();
    const { api, control } = flaky(journal.api);
    await renderToday(api);
    control.failing = true;
    await typeInEditor(user, 'Synthetic: unsaved words.');
    await screen.findByText("Couldn't save");
    await user.click(slotTab('Evening'));
    expect(await screen.findByText(/This entry has changes that are not saved yet, so it stays open/)).toBeInTheDocument();
    expect(slotTab('Morning')).toHaveAttribute('aria-selected', 'true');
    expect(journalEditor('Morning')).toHaveTextContent('Synthetic: unsaved words.');

    control.failing = false;
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    await waitForSaved();
    expect(screen.queryByText(/This entry has changes that are not saved yet, so it stays open/)).not.toBeInTheDocument();
    await openSlot(user, 'Evening');
    expect(slotTab('Morning')).toHaveTextContent('Draft');
  });

  it('saves at once with Command-S and shows the save state', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api, { delay: 60_000 });
    await typeInEditor(user, 'Synthetic: saved on request.');
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(await api.entriesOn(DATE)).toEqual([]);
    await user.keyboard('{Meta>}s{/Meta}');
    await waitForSaved();
    expect(textOf(await onlyEntry(api))).toBe('Synthetic: saved on request.');
    expect(journalEditor()).not.toHaveTextContent('Synthetic: saved on request.s');
  });

  it('round-trips French text with accents and emoji exactly as written', async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    // Deliberate multilingual synthetic fixture.
    const french = "Fiction : une journée très calme à Montréal, où l'été s'attarde « encore » ☕🌿";
    const first = await renderToday(api);
    await typeInEditor(user, french);
    await waitForSaved();
    first.unmount();

    await renderToday(restart());
    expect(journalEditor()).toHaveTextContent(french);
    expect(textOf(await onlyEntry(restart()))).toBe(french);
  });

  it('keeps a long Unicode entry with lists and quotes whole and editable', { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    // Deliberate multilingual synthetic fixture, long enough to rule out truncation.
    const headingText = 'Synthetic heading';
    const listText = 'Première liste 🌱';
    const quoteText = '« Une citation fictive »';
    const lines = Array.from(
      { length: 400 },
      (_, index) => `Paragraphe fictif ${index + 1} : café, naïve, cœur, déjà-vu 🌿 — synthetic text without a limit.`,
    );
    const originalText = [headingText, listText, quoteText, ...lines].join('\n');
    const editedText = `${originalText} Fin.`;
    await api.saveEntry({
      ...draft(),
      document: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: headingText }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(listText)] }] },
          { type: 'blockquote', content: [paragraph(quoteText)] },
          ...lines.map(paragraph),
        ],
      },
    });
    const first = await renderToday(api);
    // Pause mid-edit so autosave persists the space before typing resumes.
    await typeInEditor(user, ' ');
    await waitFor(async () => expect(textOf(await onlyEntry(api))).toBe(`${originalText} `), {
      timeout: SAVE_TIMEOUT_MS,
    });
    await user.keyboard('Fin.');
    await waitFor(async () => expect(textOf(await onlyEntry(api))).toBe(editedText), { timeout: SAVE_TIMEOUT_MS });
    first.unmount();

    await renderToday(restart());
    const editor = journalEditor();
    expect(Array.from(editor.children, (block) => block.textContent).join('\n')).toBe(editedText);
    expect(editor.querySelector('h2')).toHaveTextContent(headingText);
    expect(editor.querySelector('li')).toHaveTextContent(listText);
    expect(editor.querySelector('blockquote')).toHaveTextContent(quoteText);
  });

  it('offers to reload when the entry changed elsewhere, then shows the saved version', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    const saved = await api.saveEntry(draft('morning', DATE, 'Synthetic: original.'));
    await renderToday(api);
    await api.saveEntry({ ...saved, document: { type: 'doc', content: [paragraph('Synthetic: changed elsewhere.')] } });
    await typeInEditor(user, ' More words.');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.conflict);
    expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Reload saved version' }));
    await waitFor(() => expect(journalEditor()).toHaveTextContent('Synthetic: changed elsewhere.'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps an entry that can no longer be saved open so its writing can be copied, without promising a save', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    const saved = await api.saveEntry(draft('morning', DATE, 'Synthetic: original.'));
    await renderToday(api);
    await api.saveEntry({ ...saved, document: { type: 'doc', content: [paragraph('Synthetic: changed elsewhere.')] } });
    await typeInEditor(user, ' More words.');
    await screen.findByRole('alert');
    await user.click(slotTab('Evening'));
    expect(
      await screen.findByText(
        "These changes can't be saved, so this entry stays open. Copy any writing you want to keep before you reload: reloading shows the saved version without your recent changes.",
      ),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/nothing is lost|Once it is saved/);
    expect(slotTab('Morning')).toHaveAttribute('aria-selected', 'true');
    expect(journalEditor()).toHaveTextContent('Synthetic: original. More words.');
  });
});

describe('Today: editor', () => {
  it('formats with the toolbar and shortcuts and shows the current document as Markdown', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await typeInEditor(user, 'Synthetic heading');
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    await user.click(within(toolbar).getByRole('button', { name: 'Heading' }));
    expect(within(toolbar).getByRole('button', { name: 'Heading' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Enter}Plain then ');
    await user.keyboard('{Control>}b{/Control}bold words');
    expect(within(toolbar).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'View Markdown' }));
    const dialog = screen.getByRole('dialog', { name: 'Markdown' });
    const markdown = within(dialog).getByLabelText('Markdown text');
    expect(markdown).toHaveTextContent('## Synthetic heading');
    expect(markdown).toHaveTextContent('Plain then **bold words**');
    await user.click(within(dialog).getByRole('button', { name: 'Copy Markdown' }));
    expect(await within(dialog).findByText('Copied to the clipboard.')).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toContain('## Synthetic heading');
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));

    await typeInEditor(user, ' and more');
    await user.click(screen.getByRole('button', { name: 'View Markdown' }));
    expect(within(screen.getByRole('dialog', { name: 'Markdown' })).getByLabelText('Markdown text')).toHaveTextContent(
      'and more',
    );
  });

  it('hides the toolbar when switched off, keeps shortcuts, and can count words', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await setPreferences(api, { showToolbar: false, showWordCount: true });
    await renderToday(api);
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument();
    expect(screen.getByText('0 words')).toBeInTheDocument();
    await typeInEditor(user, 'Synthetic three words');
    expect(screen.getByText('3 words')).toBeInTheDocument();
    await user.keyboard('{Control>}i{/Control} slanted');
    await user.click(screen.getByRole('button', { name: 'View Markdown' }));
    expect(screen.getByLabelText('Markdown text')).toHaveTextContent('Synthetic three words *slanted*');
  });

  it('enters focus mode, hiding nonessential panels while writing and save status stay, and leaves with Escape', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await user.click(screen.getByRole('button', { name: 'Focus mode' }));
    expect(screen.getByRole('button', { name: 'Focus mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(journalEditor()).toHaveFocus();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Writing depth' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Check-in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous day' })).not.toBeInTheDocument();
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026 Today');
    await user.keyboard('Synthetic: focused writing.');
    await waitForSaved();

    // A real Escape carries keyCode 27, which the editor marks as handled (user-event's has none).
    const escape = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
    act(() => {
      journalEditor().dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Focus mode' })).toHaveAttribute('aria-pressed', 'false');
    expect(journalEditor()).toHaveFocus();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Check-in' })).toBeInTheDocument();
  });

  it('closes a dialog with Escape before leaving focus mode', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await user.click(screen.getByRole('button', { name: 'Focus mode' }));
    await user.keyboard('Synthetic: words to review.');
    await user.click(screen.getByRole('button', { name: 'View Markdown' }));
    expect(screen.getByRole('dialog', { name: 'Markdown' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Markdown' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus mode' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reaches the editor from the keyboard and with Write directly', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await user.click(screen.getByRole('button', { name: 'Write directly' }));
    expect(journalEditor()).toHaveFocus();

    screen.getByRole('button', { name: 'Continue' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveFocus();
    await user.tab();
    expect(journalEditor()).toHaveFocus();
  });
});

describe('Today: moving and trashing entries', () => {
  it('refuses moving onto an occupied slot and leaves both entries untouched', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    const morning = await api.saveEntry({ ...draft('morning', DATE, 'Synthetic morning'), mood: 2 });
    const evening = await api.saveEntry({ ...draft('evening', DATE, 'Synthetic evening'), mood: 7 });
    await renderToday(api);
    await user.click(screen.getByRole('button', { name: 'Change date or slot' }));
    const dialog = screen.getByRole('dialog', { name: 'Change date or slot' });
    await user.click(within(dialog).getByRole('radio', { name: 'Evening' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move entry' }));
    expect(await within(dialog).findByText(ERROR_MESSAGES.occupied)).toBeInTheDocument();
    expect(await api.entriesOn(DATE)).toEqual([morning, evening]);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(journalEditor('Morning')).toHaveTextContent('Synthetic morning');
  });

  it('moves an entry to a free date and slot and opens it there', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    const morning = await api.saveEntry({ ...draft('morning', DATE, 'Synthetic morning'), mood: 2 });
    await renderToday(api);
    await user.click(screen.getByRole('button', { name: 'Change date or slot' }));
    const dialog = screen.getByRole('dialog', { name: 'Change date or slot' });
    await user.click(within(dialog).getByRole('button', { name: 'Friday 20 November 2026' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Evening' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move entry' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday 20 November 2026' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Evening journal, Friday 20 November 2026' })).toHaveTextContent(
      'Synthetic morning',
    );
    expect(await onlyEntry(api, '2026-11-20')).toMatchObject({
      id: morning.id,
      slot: 'evening',
      mood: 2,
      revision: morning.revision + 1,
    });
    expect(await api.entriesOn(DATE)).toEqual([]);
  });

  it('saves pending writing, then moves the entry to Trash for 30 days', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api, { delay: 60_000 });
    await typeInEditor(user, 'Synthetic: a draft to put away.');
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Move this entry to Trash?' });
    expect(dialog).toHaveTextContent('You can restore it from Trash for 30 days.');
    await user.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));
    expect(
      await screen.findByText('Entry moved to Trash. You can restore it from Trash for 30 days.'),
    ).toBeInTheDocument();
    expect(await api.entriesOn(DATE)).toEqual([]);
    const trash = await api.listTrash();
    expect(trash).toHaveLength(1);
    expect(textOf(trash[0].entry)).toContain('Synthetic: a draft to put away.');
    await waitFor(() => expect(slotTab('Morning')).toHaveTextContent('Not started'));
    expect(journalEditor()).toHaveTextContent('');
  });
});

describe('Today: writing this version cannot edit exactly', () => {
  it('keeps the whole entry read-only, explains why, and never saves over it', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    const saved = await api.saveEntry({ ...draft('morning', DATE, 'Synthetic linked words.'), mood: 4 });
    const linked: Entry = {
      ...saved,
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Synthetic linked words.', marks: [{ type: 'link', attrs: { href: 'https://example.invalid' } }] },
            ],
          },
        ],
      },
    };
    const saveEntry = vi.fn((entry: Entry) => api.saveEntry(entry));
    const restored: JournalApi = {
      ...api,
      saveEntry,
      entriesOn: async (date) => (await api.entriesOn(date)).map((entry) => (entry.id === saved.id ? linked : entry)),
    };
    await renderToday(restored);
    expect(screen.getByText(PROTECTED_DOCUMENT_MESSAGE)).toBeInTheDocument();
    expect(journalEditor()).toHaveAttribute('aria-readonly', 'true');
    expect(journalEditor()).toHaveTextContent('Synthetic linked words.');
    expect(within(scale('Mood')).getByRole('radio', { name: /^6,/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^Quick Check-in/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument();
    await goToStage(user, 'Small wins and pride');
    expect(screen.getByRole('textbox', { name: 'Add a small win' })).toBeDisabled();

    await typeInEditor(user, ' more');
    await user.keyboard('{Meta>}s{/Meta}');
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(saveEntry).not.toHaveBeenCalled();
    expect(journalEditor()).toHaveTextContent('Synthetic linked words.');
    expect(journalEditor()).not.toHaveTextContent('more');
    expect(screen.getByRole('button', { name: 'Move to Trash' })).toBeInTheDocument();
  });
});

describe('Today: privacy', () => {
  it('writes and saves without any network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await typeInEditor(user, 'Synthetic: private words.');
    await waitForSaved();
    expect(fetch).not.toHaveBeenCalled();
  });
});

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { JournalApi } from '../../api/client';
import type { Entry, Slot } from '../../api/types';
import { newDraft } from '../../domain/entry';
import { createTestApi, renderWithProviders, TEST_NOW } from '../../test/render';
import { PREVIEW_LENGTH, TrashView, trashPreview } from './TrashView';

const DAY_MS = 86_400_000;

function documentOf(text: string): Entry['document'] {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
  };
}

/** A journal with a clock the test can move. */
function journal(start: Date = TEST_NOW) {
  const clock = { now: start };
  const api = createTestApi({ now: () => clock.now });
  return { api, clock };
}

async function saveEntry(api: JournalApi, date: string, slot: Slot, text: string, changes: Partial<Entry> = {}) {
  return api.saveEntry({ ...newDraft(date, slot, 'Europe/Paris'), document: documentOf(text), ...changes });
}

async function trash(api: JournalApi, entry: Entry) {
  await api.trashEntry(entry.id, entry.revision);
}

/**
 * A journal kept busy, for example by a backup: restores and permanent deletions wait, then run
 * one at a time in the order they were asked for, as the native app's journal runs them.
 */
function busyJournal(journal: JournalApi) {
  let release!: () => void;
  let queue: Promise<unknown> = new Promise<void>((resolve) => {
    release = resolve;
  });
  function queued<T>(write: () => Promise<T>): Promise<T> {
    const result = queue.then(write);
    queue = result.catch(() => undefined);
    return result;
  }
  const api: JournalApi = {
    ...journal,
    restoreEntry: (id) => queued(() => journal.restoreEntry(id)),
    deleteEntryPermanently: (id) => queued(() => journal.deleteEntryPermanently(id)),
  };
  return {
    api,
    /** Ends the busy period and lets every waiting write run. */
    release: () =>
      act(async () => {
        release();
        await queue;
      }),
  };
}

async function renderTrash(api: JournalApi) {
  renderWithProviders(<TrashView />, { api, initialView: 'trash' });
  await screen.findByRole('heading', { level: 1, name: 'Trash' });
}

function item(name: RegExp) {
  return screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
}

describe('Trash', () => {
  it('explains the 30-day retention when nothing has been deleted', async () => {
    const { api } = journal();
    await renderTrash(api);
    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
    expect(screen.getByText(/stays here for 30 days, so you can restore it/)).toBeInTheDocument();
  });

  it('lists a deleted entry with its date, slot, own words, deletion date and kept-until date', async () => {
    const { api } = journal();
    const saved = await saveEntry(api, '2026-11-20', 'morning', 'Fictional entry: a quiet walk by the canal.');
    await trash(api, saved);
    await renderTrash(api);

    const entry = await screen.findByRole('heading', { level: 2, name: 'Friday 20 November 2026, Morning' });
    const row = entry.closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Fictional entry: a quiet walk by the canal.');
    expect(row).toHaveTextContent('Deleted 22 November 2026 at 10:00');
    expect(row).toHaveTextContent('Kept until 22 December 2026');
    expect(
      within(row).getByRole('button', { name: 'Restore the Morning entry from Friday 20 November 2026' }),
    ).toBeVisible();
    expect(
      within(row).getByRole('button', { name: 'Delete permanently the Morning entry from Friday 20 November 2026' }),
    ).toBeVisible();
  });

  it('restores an entry into its free slot with all its answers', async () => {
    const user = userEvent.setup();
    const { api } = journal();
    const saved = await saveEntry(api, '2026-11-20', 'evening', 'Fictional evening notes.', {
      mood: 0,
      energy: 10,
      pride: 6,
      progress: 4,
      emotion: 'calm',
      reflection: {
        intention: '',
        proudOf: 'Finished the synthetic puzzle.',
        difficulty: 'A fictional delay.',
        nextStep: 'Rest early.',
        helped: 'Tea.',
        learned: 'Small steps help.',
      },
      actions: [{ id: '0b8f4c34-8f0e-4a3b-9a59-3f9f3b0c7a10', text: 'Read a chapter', category: 'reading' }],
    });
    await trash(api, saved);
    await renderTrash(api);

    await user.click(await screen.findByRole('button', { name: /^Restore the Evening entry/ }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The Evening entry from Friday 20 November 2026 is back in your journal.',
    );
    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
    const [restored] = await api.entriesOn('2026-11-20');
    expect(restored).toEqual({ ...saved, revision: saved.revision + 1 });
  });

  it('reports an occupied slot without overwriting either entry', async () => {
    const user = userEvent.setup();
    const { api } = journal();
    const deleted = await saveEntry(api, '2026-11-21', 'morning', 'Fictional first draft.');
    await trash(api, deleted);
    const replacement = await saveEntry(api, '2026-11-21', 'morning', 'Fictional replacement written later.');
    await renderTrash(api);

    await user.click(await screen.findByRole('button', { name: /^Restore the Morning entry/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Saturday 21 November 2026 already has a Morning entry');
    expect(alert).toHaveTextContent('Nothing was overwritten: both entries are kept.');
    expect(item(/Saturday 21 November 2026/)).toBeInTheDocument();
    await expect(api.entriesOn('2026-11-21')).resolves.toEqual([replacement]);
    await expect(api.listTrash()).resolves.toEqual([
      expect.objectContaining({ entry: expect.objectContaining({ id: deleted.id }) }),
    ]);
  });

  it('deletes permanently only after confirmation and says earlier backups may keep a copy', async () => {
    const user = userEvent.setup();
    const { api } = journal();
    const saved = await saveEntry(api, '2026-11-19', 'morning', 'Fictional entry to remove.');
    await trash(api, saved);
    await renderTrash(api);

    await user.click(await screen.findByRole('button', { name: /^Delete permanently/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this entry permanently?' });
    expect(dialog).toHaveAccessibleDescription(
      /The Morning entry from Thursday 19 November 2026 will be removed from the journal on this Mac\..*Earlier encrypted backups may still contain it until they are pruned/,
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await expect(api.listTrash()).resolves.toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /^Delete permanently/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The entry was deleted permanently. Earlier backups may still contain it until they are pruned.',
    );
    expect(screen.getByText('The trash is empty.')).toBeInTheDocument();
    await expect(api.listTrash()).resolves.toEqual([]);
    await expect(api.restoreEntry(saved.id)).rejects.toMatchObject({ code: 'notFound' });
  });

  it('offers no permanent deletion of an entry while it is being restored', async () => {
    const user = userEvent.setup();
    const { api: memory } = journal();
    const saved = await saveEntry(memory, '2026-11-18', 'morning', 'Fictional entry restored during a backup.');
    await trash(memory, saved);
    const busy = busyJournal(memory);
    await renderTrash(busy.api);

    // The journal is busy, so the restore waits; the person then changes their mind.
    await user.click(await screen.findByRole('button', { name: /^Restore the Morning entry/ }));
    const deleteButton = screen.getByRole('button', { name: /^Delete permanently the Morning entry/ });
    expect(deleteButton).toBeDisabled();
    await user.click(deleteButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await busy.release();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The Morning entry from Wednesday 18 November 2026 is back in your journal.',
    );
    expect(screen.queryByText(/deleted permanently/)).not.toBeInTheDocument();
    expect(screen.getByText('The trash is empty.')).toBeInTheDocument();
    await expect(memory.entriesOn('2026-11-18')).resolves.toEqual([{ ...saved, revision: saved.revision + 1 }]);
  });

  it('says an entry that left the trash before its deletion is no longer there, and reloads the list', async () => {
    const user = userEvent.setup();
    const { api, clock } = journal();
    const restored = await saveEntry(api, '2026-11-14', 'morning', 'Fictional entry restored elsewhere.');
    await trash(api, restored);
    clock.now = new Date(TEST_NOW.getTime() + 60_000);
    await trash(api, await saveEntry(api, '2026-11-15', 'evening', 'Fictional entry that stays in the trash.'));
    await renderTrash(api);

    await user.click(
      await screen.findByRole('button', { name: /^Delete permanently the Morning entry from Saturday 14/ }),
    );
    // Before the deletion runs, the entry is restored and another one is deleted.
    await api.restoreEntry(restored.id);
    clock.now = new Date(TEST_NOW.getTime() + 120_000);
    await trash(api, await saveEntry(api, '2026-11-13', 'evening', 'Fictional entry deleted meanwhile.'));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That entry is no longer in the trash.');
    expect(screen.queryByText(/deleted permanently/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: /Friday 13 November 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Sunday 15 November 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: /Saturday 14 November 2026/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Restore the Evening entry from Sunday 15/ })).toHaveFocus();
    await expect(api.entriesOn('2026-11-14')).resolves.toEqual([{ ...restored, revision: restored.revision + 1 }]);
  });

  it('closes a confirmation whose entry leaves the list', async () => {
    const user = userEvent.setup();
    const { api: memory, clock } = journal();
    await trash(memory, await saveEntry(memory, '2026-11-10', 'morning', 'Fictional entry about to expire.'));
    await trash(memory, await saveEntry(memory, '2026-11-11', 'evening', 'Fictional entry also about to expire.'));
    clock.now = new Date(TEST_NOW.getTime() + 30 * DAY_MS - 60_000);
    const busy = busyJournal(memory);
    await renderTrash(busy.api);

    await user.click(await screen.findByRole('button', { name: /^Restore the Morning entry from Tuesday 10/ }));
    await user.click(screen.getByRole('button', { name: /^Delete permanently the Evening entry from Wednesday 11/ }));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(/The Evening entry from Wednesday 11/);
    // Both entries expire while the restore waits, so the reload after it no longer lists either.
    clock.now = new Date(TEST_NOW.getTime() + 30 * DAY_MS);
    await busy.release();

    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('That entry is no longer in the trash.');
    expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveFocus();
  });

  it('no longer offers an entry once its 30 days have passed', async () => {
    const { api, clock } = journal();
    const expired = await saveEntry(api, '2026-10-01', 'evening', 'Fictional entry deleted long ago.');
    await trash(api, expired);
    clock.now = new Date(TEST_NOW.getTime() + 31 * DAY_MS);
    const recent = await saveEntry(api, '2026-12-20', 'morning', 'Fictional entry deleted today.');
    await trash(api, recent);
    await renderTrash(api);

    expect(await screen.findByRole('heading', { level: 2, name: /Sunday 20 December 2026/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: /1 October 2026/ })).not.toBeInTheDocument();
    await expect(api.restoreEntry(expired.id)).rejects.toMatchObject({ code: 'notFound' });
  });

  it('works from the keyboard and keeps focus nearby after restoring', async () => {
    const user = userEvent.setup();
    const { api, clock } = journal();
    await trash(api, await saveEntry(api, '2026-11-16', 'morning', 'Fictional.'));
    clock.now = new Date(TEST_NOW.getTime() + 60_000);
    await trash(api, await saveEntry(api, '2026-11-17', 'morning', 'Fictional.'));
    await renderTrash(api);

    const first = await screen.findByRole('button', { name: /^Restore the Morning entry from Tuesday 17/ });
    first.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: /^Delete permanently the Morning entry from Tuesday 17/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /^Restore the Morning entry from Monday 16/ })).toHaveFocus();

    await user.keyboard('{Enter}');
    await screen.findByText(/Monday 16 November 2026 is back in your journal/);
    expect(screen.getByRole('button', { name: /^Restore the Morning entry from Tuesday 17/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Trash' })).toHaveFocus();
  });
});

describe('trash preview', () => {
  it('shows the person’s words exactly, shortening only a long text', () => {
    // Deliberate multilingual synthetic fixture.
    const words = 'Une journée calme 🌿 — 静かな朝.';
    expect(trashPreview({ document: documentOf(words), title: '' })).toBe(words);

    const long = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
    const preview = trashPreview({ document: documentOf(long), title: '' });
    expect(preview.endsWith('…')).toBe(true);
    expect(Array.from(preview).length).toBeLessThanOrEqual(PREVIEW_LENGTH + 1);
    expect(long.startsWith(preview.slice(0, -1))).toBe(true);
  });

  it('keeps a partly formatted word whole and reads a line break as a space', () => {
    const document: Entry['document'] = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A peaceful ' },
            { type: 'text', text: 'after', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'noon' },
            { type: 'hardBreak' },
            { type: 'text', text: 'by the canal.' },
          ],
        },
      ],
    };
    expect(trashPreview({ document, title: '' })).toBe('A peaceful afternoon by the canal.');
  });

  it('joins paragraphs with spaces and falls back to the title', () => {
    expect(trashPreview({ document: documentOf('First line\nSecond line'), title: '' })).toBe('First line Second line');
    expect(
      trashPreview({ document: { type: 'doc', content: [{ type: 'paragraph' }] }, title: 'A fictional title' }),
    ).toBe('A fictional title');
  });
});

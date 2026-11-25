import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discardAllSavers } from '../../state/autosave';
import { createJournal, DATE, journalEditor, onlyEntry, renderToday, typeInEditor, waitForSaved } from './testing';

afterEach(() => {
  discardAllSavers();
});

describe('Today: shown again after midnight', () => {
  it('moves on to the new date when the window is shown again past midnight with no focus event, as after the Mac wakes', async () => {
    const user = userEvent.setup();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    // 22:00 in Paris on Sunday 22 November.
    const { api, clock } = createJournal(new Date('2026-11-22T21:00:00Z'));
    await renderToday(api);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Sunday 22 November 2026 Today');
    await user.click(screen.getByRole('button', { name: 'Write directly' }));
    expect(journalEditor()).toHaveFocus();

    // As when the Mac sleeps with the window still focused: the window is reported
    // hidden, then visible again at 07:00 on Monday 23 November, with no focus event.
    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    clock.set(new Date('2026-11-23T06:00:00Z'));
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Monday 23 November 2026 Today' })).toBeInTheDocument();
    const monday = await screen.findByRole('textbox', { name: 'Morning journal, Monday 23 November 2026' });
    await waitFor(() => expect(monday).toHaveFocus());
    await typeInEditor(user, 'Synthetic: the first words after waking.');
    await waitForSaved();
    expect(await onlyEntry(api, '2026-11-23')).toMatchObject({ slot: 'morning', date: '2026-11-23' });
    expect(await api.entriesOn(DATE)).toEqual([]);
  });
});

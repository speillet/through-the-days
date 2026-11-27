import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discardAllSavers } from '../../state/autosave';
import { renderWithProviders } from '../../test/render';
import { createJournal, DATE, journalEditor, onlyEntry, renderToday, typeInEditor, waitForSaved } from './testing';
import { TodayView } from './TodayView';

afterEach(() => {
  discardAllSavers();
  vi.useRealTimers();
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

describe('Today: open across midnight', () => {
  it('moves on at midnight while the window stays open and focused, so the first words start the new date', async () => {
    // 23:59:50 in Paris on Sunday 22 November; the Mac stays awake with Today in front.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-22T22:59:50Z'));
    const { api, clock } = createJournal(new Date('2026-11-22T22:59:50Z'));
    renderWithProviders(<TodayView autosaveDelayMs={10} />, { api });
    // Find queries wait on a timeout, which is simulated here: let the journal answer instead.
    for (let turn = 0; turn < 5; turn += 1) await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Sunday 22 November 2026 Today');
    expect(journalEditor()).toHaveAccessibleName('Morning journal, Sunday 22 November 2026');

    // Ten seconds pass with no minute tick, focus or visibility event.
    clock.set(new Date('2026-11-22T23:00:10Z')); // 00:00:10 on Monday 23 November.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    vi.useRealTimers();

    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'Morning journal, Monday 23 November 2026' });
    await typeInEditor(user, 'Synthetic: the first words just after midnight.');
    await waitForSaved();
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Monday 23 November 2026 Today');
    expect(await onlyEntry(api, '2026-11-23')).toMatchObject({ slot: 'morning', date: '2026-11-23' });
    expect(await api.entriesOn(DATE)).toEqual([]);
  });
});

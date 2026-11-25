import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { newDraft } from '../../domain/entry';
import { discardAllSavers } from '../../state/autosave';
import { createJournal, DATE, onlyEntry, SAVE_TIMEOUT_MS, typeInEditor, waitForSaved } from './testing';

afterEach(() => {
  discardAllSavers();
});

/** The whole app starts and mounts editors here; a busy machine gets as long as for a save. */
const APP_WAIT = { timeout: SAVE_TIMEOUT_MS };

function heading() {
  return screen.getByRole('heading', { level: 1 });
}

function slotTab(name: 'Morning' | 'Evening') {
  return within(screen.getByRole('tablist', { name: 'Entries for this date' })).getByRole('tab', {
    name: new RegExp(`^${name}`),
  });
}

function passMidnight(clock: ReturnType<typeof createJournal>['clock'], next: Date) {
  clock.set(next);
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

describe("Today: today's date opened from a reading view", () => {
  it("starts an empty slot on the new date after midnight when Calendar opened today's entry", async () => {
    const user = userEvent.setup();
    // 22:00 in Paris on Sunday 22 November.
    const { api, clock } = createJournal(new Date('2026-11-22T21:00:00Z'));
    await api.saveEntry({
      ...newDraft(DATE, 'evening', 'Europe/Paris'),
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic: the evening before.' }] }],
      },
    });
    render(<App api={api} initialView="calendar" />);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Evening entry from 22 November 2026' }, APP_WAIT),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Evening journal, Sunday 22 November 2026' }, APP_WAIT),
    ).toHaveTextContent('Synthetic: the evening before.');

    passMidnight(clock, new Date('2026-11-23T07:00:00Z')); // 08:00 on Monday 23 November.
    expect(await screen.findByRole('button', { name: 'Go to today' }, APP_WAIT)).toBeInTheDocument();
    // The entry left open keeps its date, as when Today is opened from the navigation.
    expect(heading()).toHaveAccessibleName('Sunday 22 November 2026');
    await user.click(slotTab('Morning'));
    expect(
      await screen.findByRole('textbox', { name: 'Morning journal, Monday 23 November 2026' }, APP_WAIT),
    ).toBeInTheDocument();
    expect(heading()).toHaveAccessibleName('Monday 23 November 2026 Today');
    await typeInEditor(user, 'Synthetic: Monday morning.');
    await waitForSaved();
    expect(await onlyEntry(api, '2026-11-23')).toMatchObject({ slot: 'morning' });
    expect(await onlyEntry(api, DATE)).toMatchObject({ slot: 'evening' });
  });

  it('moves on to the new date after midnight when a Trends day opened today with nothing written', async () => {
    const user = userEvent.setup();
    // 23:50 in Paris on Sunday 22 November.
    const { api, clock } = createJournal(new Date('2026-11-22T22:50:00Z'));
    render(<App api={api} initialView="trends" />);
    const days = await screen.findByRole('list', { name: 'Recorded days and gaps' }, APP_WAIT);
    await user.click(within(days).getByTitle('Sunday 22 November 2026'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sunday 22 November 2026 Today' }, APP_WAIT),
    ).toBeInTheDocument();

    passMidnight(clock, new Date('2026-11-22T23:10:00Z')); // 00:10 on Monday 23 November.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Monday 23 November 2026 Today' }, APP_WAIT),
    ).toBeInTheDocument();
    await screen.findByRole('textbox', { name: 'Morning journal, Monday 23 November 2026' }, APP_WAIT);
    await typeInEditor(user, 'Synthetic: the first words of Monday.');
    await waitForSaved();
    expect(await onlyEntry(api, '2026-11-23')).toMatchObject({ slot: 'morning' });
    expect(await api.entriesOn(DATE)).toEqual([]);
  });
});

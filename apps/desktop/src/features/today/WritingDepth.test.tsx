import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discardAllSavers } from '../../state/autosave';
import {
  chooseScore,
  createJournal,
  DATE,
  journalEditor,
  onlyEntry,
  renderToday,
  setPreferences,
  typeInEditor,
  waitForSaved,
} from './testing';

afterEach(() => {
  discardAllSavers();
});

function depth(name: RegExp) {
  return screen.getByRole('radio', { name });
}

describe('Writing depth', () => {
  it('switches a partial draft between depths without changing its identity, date, slot, writing or scores', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    expect(depth(/^Daily Journal/)).toBeChecked();
    await chooseScore(user, 'Mood', 4);
    await chooseScore(user, 'How is my energy?', 3);
    await typeInEditor(user, 'Synthetic: a partial morning draft.');
    await waitForSaved();
    const before = await onlyEntry(api);

    await user.click(depth(/^Quick Check-in/));
    await waitForSaved();
    await user.click(depth(/^Deep Reflection/));
    await waitForSaved();
    const after = await onlyEntry(api);
    expect(after).toEqual({ ...before, depth: 'deep', revision: before.revision + 2 });
    expect(journalEditor()).toHaveTextContent('Synthetic: a partial morning draft.');
  });

  it('shows only mood and energy beside the page in Quick Check-in, and saves nothing for the choice alone', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await user.click(depth(/^Quick Check-in/));
    expect(screen.getByRole('group', { name: 'Mood' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'How is my energy?' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Check-in steps' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Which word fits?' })).not.toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(await api.entriesOn(DATE)).toEqual([]);

    await chooseScore(user, 'Mood', 6);
    await waitForSaved();
    expect(await onlyEntry(api)).toMatchObject({ depth: 'quick', mood: 6, energy: null });
  });

  it('says Deep Reflection worksheets are not available yet, keeps writing usable and calls no remote service', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await user.click(depth(/^Deep Reflection/));
    expect(
      screen.getByText(
        /Guided worksheets for Deep Reflection arrive with the CBT exercises milestone and are not available yet\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Check-in steps' })).toBeInTheDocument();
    await typeInEditor(user, 'Synthetic: deeper thoughts, written freely.');
    await waitForSaved();
    expect(await onlyEntry(api)).toMatchObject({ depth: 'deep' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hides suggested durations when they are switched off, with no timer anywhere', async () => {
    const { api } = createJournal();
    await renderToday(api);
    expect(screen.getByText('About 30 seconds')).toBeInTheDocument();
    expect(screen.getByText('About 5–10 minutes')).toBeInTheDocument();
    expect(screen.getByText('About 15–20 minutes')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('keeps writing available when durations are hidden and the depth choice is skipped', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await setPreferences(api, { showDurations: false });
    await renderToday(api);
    expect(screen.queryByText(/About \d/)).not.toBeInTheDocument();
    await typeInEditor(user, 'Synthetic: straight to writing.');
    await waitForSaved();
    expect(await onlyEntry(api)).toMatchObject({ depth: 'daily' });
  });

  it('creates the draft lazily with the journal time zone and default depth, whatever the energy', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await setPreferences(api, { timeZone: 'America/New_York', defaultDepth: 'quick' });
    await renderToday(api);
    expect(depth(/^Quick Check-in/)).toBeChecked();
    expect(await api.entriesOn(DATE)).toEqual([]);
    await chooseScore(user, 'How is my energy?', 1);
    await waitForSaved();
    expect(depth(/^Quick Check-in/)).toBeChecked();
    expect(await onlyEntry(api)).toMatchObject({
      date: DATE,
      slot: 'morning',
      createdTimeZone: 'America/New_York',
      depth: 'quick',
      energy: 1,
    });
  });
});

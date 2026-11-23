import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { JournalApi } from '../../api/client';
import { ERROR_MESSAGES } from '../../api/memory';
import { newDraft } from '../../domain/entry';
import { discardAllSavers } from '../../state/autosave';
import {
  checkedScore,
  createJournal,
  DATE,
  goToStage,
  onlyEntry,
  renderToday,
  setPreferences,
  typeInEditor,
  waitForSaved,
} from './testing';

afterEach(() => {
  discardAllSavers();
});

function steps() {
  return within(screen.getByRole('list', { name: 'Check-in steps' }))
    .getAllByRole('button')
    .map((step) => step.textContent);
}

describe('Gentle view', () => {
  it('hides scores, durations and completion prompts, keeps wins and emotion words, and still shows save failures', async () => {
    const user = userEvent.setup();
    const { api: journal } = createJournal();
    const control = { failing: false };
    const api: JournalApi = {
      ...journal,
      saveEntry: (entry) =>
        control.failing ? Promise.reject({ code: 'storage', message: ERROR_MESSAGES.storage }) : journal.saveEntry(entry),
    };
    await setPreferences(api, { gentle: true });
    await renderToday(api);

    expect(
      screen.getByText('Gentle view is on: scores and tracking prompts are hidden. Nothing was deleted.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Mood' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /neutral/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/About \d/)).not.toBeInTheDocument();
    expect(steps()).not.toContain('Moving forward');
    expect(screen.getByRole('group', { name: 'Which word fits?' })).toBeInTheDocument();

    await goToStage(user, 'Small wins and pride');
    expect(screen.queryByRole('group', { name: 'How proud do I feel?' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Add a small win' }), 'Synthetic: made soup{Enter}');
    expect(within(screen.getByRole('list', { name: 'Small wins' })).getAllByRole('listitem')).toHaveLength(1);
    await typeInEditor(user, 'Synthetic: gentle words.');
    await waitForSaved();
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument();

    control.failing = true;
    await typeInEditor(user, ' More gentle words.');
    expect(await screen.findByText("Couldn't save")).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_MESSAGES.storage);
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('restores the earlier display choices afterwards without changing any saved value', async () => {
    const { api, restart } = createJournal();
    const saved = await api.saveEntry({ ...newDraft(DATE, 'morning', 'Europe/Paris'), mood: 3, energy: 7, pride: 6 });
    await setPreferences(api, { gentle: true });
    const gentle = await renderToday(api);
    expect(screen.queryByRole('group', { name: 'Mood' })).not.toBeInTheDocument();
    gentle.unmount();

    const reopened = restart();
    await setPreferences(reopened, { gentle: false });
    await renderToday(reopened);
    expect(checkedScore('Mood')).toBe(3);
    expect(checkedScore('How is my energy?')).toBe(7);
    expect(screen.getByText('About 30 seconds')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
    expect(await onlyEntry(reopened)).toEqual(saved);
  });

  it('hides score panels when Show scores is off and says so if completion needs them', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await setPreferences(api, { showScores: false });
    await renderToday(api);
    expect(screen.queryByRole('group', { name: 'Mood' })).not.toBeInTheDocument();
    expect(steps()).not.toContain('Moving forward');
    await typeInEditor(user, 'Synthetic: words without scores.');
    await user.click(await screen.findByRole('button', { name: 'Mark complete' }));
    expect(
      await screen.findByText(
        /add a mood score and an energy score\. .*Scores are hidden at the moment; you can show them in Settings, under Writing\./,
      ),
    ).toBeInTheDocument();
    expect(await onlyEntry(api)).toMatchObject({ complete: false, mood: null, energy: null });
  });
});

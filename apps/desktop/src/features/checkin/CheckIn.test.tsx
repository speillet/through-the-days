import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { discardAllSavers } from '../../state/autosave';
import { flushAll } from '../../state/flush';
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
  textOf,
  typeInEditor,
  waitForSaved,
} from '../today/testing';

afterEach(() => {
  discardAllSavers();
});

const EMPTY_REFLECTION = { intention: '', proudOf: '', difficulty: '', nextStep: '', helped: '', learned: '' };

function steps() {
  return within(screen.getByRole('list', { name: 'Check-in steps' })).getAllByRole('button');
}

function winItems() {
  return within(screen.getByRole('list', { name: 'Small wins' })).getAllByRole('listitem');
}

function winField() {
  return screen.getByRole('textbox', { name: 'Add a small win' });
}

async function storedWins(api: Parameters<typeof onlyEntry>[0], date = DATE) {
  return (await onlyEntry(api, date)).wins.map(({ text, origin }) => ({ text, origin }));
}

async function waitForStoredWin(api: Parameters<typeof onlyEntry>[0], text: string, date = DATE) {
  await waitFor(async () => expect(await storedWins(api, date)).toEqual([{ text, origin: 'manual' }]), {
    timeout: SAVE_TIMEOUT_MS,
  });
}

describe('Check-in stages', () => {
  it('lets a tired person skip every stage and write at once, without inventing answers', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    expect(steps().map((step) => step.textContent)).toEqual([
      'How am I feeling?',
      "Today's intention",
      'Small wins and pride',
      'Moving forward',
      'What helped',
      'Difficulties',
    ]);
    for (let index = 0; index < steps().length; index += 1) {
      expect(screen.getByRole('button', { name: 'Write directly' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Skip' }));
    }
    expect(screen.getByRole('heading', { name: 'Check-in finished' })).toHaveFocus();
    expect(await api.entriesOn('2026-11-22')).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Start writing' }));
    expect(journalEditor()).toHaveFocus();
    await user.keyboard('Synthetic: tired, writing anyway.');
    await waitForSaved();
    const entry = await onlyEntry(api);
    expect(textOf(entry)).toBe('Synthetic: tired, writing anyway.');
    expect(entry).toMatchObject({
      mood: null,
      energy: null,
      pride: null,
      progress: null,
      emotion: '',
      anotherEmotion: '',
      actions: [],
      wins: [],
      complete: false,
      reflection: EMPTY_REFLECTION,
    });
  });

  it('moves with Back, Continue and the step list, focusing each stage heading', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 3, name: "Today's intention" })).toHaveFocus();
    expect(within(screen.getByRole('list', { name: 'Check-in steps' })).getByRole('button', { name: "Today's intention" })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 3, name: 'How am I feeling?' })).toHaveFocus();
    await goToStage(user, 'What helped');
    expect(screen.getByRole('textbox', { name: 'What helped?' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'What did I learn?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Write directly' }));
    expect(journalEditor()).toHaveFocus();
  });

  it('restores a check-in recorded without any writing', async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    const first = await renderToday(api);
    await goToStage(user, "Today's intention");
    await user.type(screen.getByRole('textbox', { name: 'What would I like to try today?' }), 'Synthetic: a short walk after lunch.');
    await user.click(screen.getByRole('button', { name: 'Reading' }));
    await waitForSaved();
    first.unmount();

    await renderToday(restart());
    await goToStage(user, "Today's intention");
    expect(screen.getByRole('textbox', { name: 'What would I like to try today?' })).toHaveValue(
      'Synthetic: a short walk after lunch.',
    );
    expect(screen.getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-pressed', 'true');
    const entry = await onlyEntry(restart());
    expect(textOf(entry)).toBe('');
    // The intended walk is an intention, never a reported action.
    expect(entry.actions.map((action) => [action.category, action.text])).toEqual([['reading', 'Reading']]);
    expect(entry.reflection.intention).toBe('Synthetic: a short walk after lunch.');
  });

  it('keeps Evening rest and reading as reported actions, never as wins, and a proposed walk as a next step', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await user.click(screen.getByRole('tab', { name: /^Evening/ }));
    await screen.findByRole('textbox', { name: /^Evening journal, / });
    await goToStage(user, 'What I did');
    expect(screen.getByRole('group', { name: 'What have I done since my last check-in?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rest' }));
    await user.click(screen.getByRole('button', { name: 'Reading' }));
    await user.type(screen.getByRole('textbox', { name: 'Something else' }), 'Synthetic: repotted a fern{Enter}');
    expect(screen.getByRole('list', { name: 'Your own activities' })).toHaveTextContent('Synthetic: repotted a fern');
    await goToStage(user, 'Difficulties and next step');
    await user.type(
      screen.getByRole('textbox', { name: "What's one small step I could take next?" }),
      'Synthetic: a walk tomorrow.',
    );
    await waitForSaved();
    const entry = await onlyEntry(api);
    expect(entry.slot).toBe('evening');
    expect(entry.actions.map((action) => [action.category, action.text])).toEqual([
      ['rest', 'Rest'],
      ['reading', 'Reading'],
      ['', 'Synthetic: repotted a fern'],
    ]);
    expect(entry.wins).toEqual([]);
    expect(entry.reflection.nextStep).toBe('Synthetic: a walk tomorrow.');

    await goToStage(user, 'What I did');
    await user.click(screen.getByRole('button', { name: 'Remove Synthetic: repotted a fern' }));
    await user.click(screen.getByRole('button', { name: 'Rest' }));
    await waitForSaved();
    expect((await onlyEntry(api)).actions.map((action) => action.category)).toEqual(['reading']);
  });

  it('keeps a Morning intention reachable and editable after the entry moves to Evening', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, "Today's intention");
    await user.type(screen.getByRole('textbox', { name: 'What would I like to try today?' }), 'Synthetic: a short walk.');
    await waitForSaved();
    await user.click(screen.getByRole('button', { name: 'Change date or slot' }));
    const dialog = screen.getByRole('dialog', { name: 'Change date or slot' });
    await user.click(within(dialog).getByRole('radio', { name: 'Evening' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move entry' }));
    await screen.findByRole('textbox', { name: /^Evening journal, / });

    expect(steps().map((step) => step.textContent)).toEqual([
      'How am I feeling?',
      "Today's intention",
      'What I did',
      'Small wins and pride',
      'Moving forward',
      'What helped',
      'Difficulties and next step',
    ]);
    await goToStage(user, "Today's intention");
    const intention = screen.getByRole('textbox', { name: 'What would I like to try today?' });
    expect(intention).toHaveValue('Synthetic: a short walk.');
    // The Evening keeps its own next step and activities in their stages.
    expect(screen.queryByRole('textbox', { name: 'One small step to try' })).not.toBeInTheDocument();
    await user.clear(intention);
    // Clearing the answer does not pull the stage away while it is open.
    expect(screen.getByRole('heading', { level: 3, name: "Today's intention" })).toBeInTheDocument();
    await user.type(intention, 'Synthetic: a longer walk.');
    await waitFor(async () => expect((await onlyEntry(api)).reflection.intention).toBe('Synthetic: a longer walk.'), {
      timeout: SAVE_TIMEOUT_MS,
    });
    expect((await onlyEntry(api)).slot).toBe('evening');
  });

  it('keeps pride missing when it is skipped while a difficulty is written', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Difficulties');
    await user.type(
      screen.getByRole('textbox', { name: 'What was difficult?' }),
      'Synthetic: a long queue at a fictional post office.',
    );
    await waitForSaved();
    const entry = await onlyEntry(api);
    expect(entry.reflection.difficulty).toBe('Synthetic: a long queue at a fictional post office.');
    expect(entry.pride).toBeNull();
    expect(entry.progress).toBeNull();
  });
});

describe('Check-in scores and emotions', () => {
  it('offers only whole numbers in range: mood and energy 0–10, pride and progress 1–10', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    const values = (name: string) =>
      within(scale(name))
        .getAllByRole('radio')
        .map((radio) => (radio as HTMLInputElement).value);
    const zeroToTen = Array.from({ length: 11 }, (_, index) => String(index));
    expect(values('Mood')).toEqual(zeroToTen);
    expect(values('How is my energy?')).toEqual(zeroToTen);
    await goToStage(user, 'Small wins and pride');
    expect(values('How proud do I feel?')).toEqual(zeroToTen.slice(1));
    await goToStage(user, 'Moving forward');
    expect(values('How much do I feel I moved forward?')).toEqual(zeroToTen.slice(1));
  });

  it('keeps four independent self-reports: low mood alongside high pride and progress', async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    const first = await renderToday(api);
    await chooseScore(user, 'Mood', 1);
    await chooseScore(user, 'How is my energy?', 2);
    await goToStage(user, 'Small wins and pride');
    await chooseScore(user, 'How proud do I feel?', 9);
    await goToStage(user, 'Moving forward');
    await chooseScore(user, 'How much do I feel I moved forward?', 8);
    await waitForSaved();
    expect(await onlyEntry(api)).toMatchObject({ mood: 1, energy: 2, pride: 9, progress: 8, complete: false });
    expect(document.body.textContent).not.toMatch(/overall|grade|score of the day/i);
    first.unmount();

    await renderToday(restart());
    expect(checkedScore('Mood')).toBe(1);
    await goToStage(user, 'Moving forward');
    expect(checkedScore('How much do I feel I moved forward?')).toBe(8);
    await user.click(screen.getByRole('button', { name: 'Clear progress' }));
    await waitForSaved();
    expect(await onlyEntry(restart())).toMatchObject({ mood: 1, energy: 2, pride: 9, progress: null });
  });

  it('identifies 5 as neutral and suggests no feeling area for it', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    expect(within(scale('Mood')).getByRole('radio', { name: '5, neutral' })).toBeInTheDocument();
    expect(within(scale('How is my energy?')).getByRole('radio', { name: '5, neutral' })).toBeInTheDocument();
    expect(within(scale('Mood')).getByRole('radio', { name: '0, very unpleasant' })).toBeInTheDocument();
    expect(within(scale('How is my energy?')).getByRole('radio', { name: '10, very high' })).toBeInTheDocument();
    await chooseScore(user, 'Mood', 5);
    await chooseScore(user, 'How is my energy?', 8);
    expect(within(scale('Mood')).getByText(/Selected: 5, neutral/)).toBeInTheDocument();
    expect(screen.getByText('A score of 5 is neutral, so no feeling area is suggested.')).toBeInTheDocument();
    expect(screen.queryByText(/These scores sit with/)).not.toBeInTheDocument();
    await waitForSaved();
    expect(await onlyEntry(api)).toMatchObject({ mood: 5, energy: 8 });
  });

  it('keeps Anxious with low energy exactly as chosen, with no correction', async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    const first = await renderToday(api);
    await chooseScore(user, 'Mood', 3);
    await chooseScore(user, 'How is my energy?', 2);
    const anxious = screen.getByRole('radio', { name: 'Anxious' });
    expect(anxious).toHaveAccessibleDescription('Uneasy about something that might happen.');
    await user.click(anxious);
    expect(anxious).toBeChecked();
    expect(screen.getByText('These scores sit with “unpleasant, lower energy” feelings.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Chosen:').parentElement).toHaveTextContent('Chosen: Anxious');
    await waitForSaved();
    expect(await onlyEntry(api)).toMatchObject({ emotion: 'anxious', mood: 3, energy: 2 });
    first.unmount();

    await renderToday(restart());
    expect(screen.getByRole('radio', { name: 'Anxious' })).toBeChecked();
    expect(checkedScore('How is my energy?')).toBe(2);
    expect(screen.queryByText(/did you mean/i)).not.toBeInTheDocument();
  });

  it("keeps the person's own emotion word in any language", async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    const first = await renderToday(api);
    await user.click(screen.getByRole('button', { name: 'Another emotion…' }));
    const field = screen.getByRole('textbox', { name: 'Another emotion' });
    expect(field).toHaveFocus();
    // Deliberate multilingual synthetic fixture.
    await user.type(field, 'mélancolie douce');
    await waitForSaved();
    expect(await onlyEntry(api)).toMatchObject({ emotion: '', anotherEmotion: 'mélancolie douce' });
    first.unmount();

    await renderToday(restart());
    expect(screen.getByRole('textbox', { name: 'Another emotion' })).toHaveValue('mélancolie douce');
  });
});

describe('Small wins', () => {
  it('adds the proud-of answer as one small win, even when asked twice', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    expect(screen.getByRole('button', { name: 'Add as a small win' })).toHaveAttribute('aria-disabled', 'true');
    await user.type(screen.getByRole('textbox', { name: 'What am I proud of?' }), 'Synthetic: I finished the fictional report.');
    await user.click(screen.getByRole('button', { name: 'Add as a small win' }));
    const added = screen.getByRole('button', { name: 'Added as a small win' });
    expect(added).toHaveAttribute('aria-disabled', 'true');
    await user.click(added);
    expect(screen.getByText('Added to your small wins. It counts once.')).toBeInTheDocument();
    expect(winItems()).toHaveLength(1);
    expect(within(winItems()[0]).getByText("From what I'm proud of")).toBeInTheDocument();
    await waitForSaved();
    const entry = await onlyEntry(api);
    expect(entry.reflection.proudOf).toBe('Synthetic: I finished the fictional report.');
    expect(entry.wins).toEqual([
      { id: expect.any(String), text: 'Synthetic: I finished the fictional report.', origin: 'pride', includeInInsights: true },
    ]);
  });

  it('adds, edits and removes small wins, each with its own insights choice', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    const add = screen.getByRole('textbox', { name: 'Add a small win' });
    await user.type(add, 'Synthetic: called a fictional friend{Enter}');
    await user.type(add, 'Synthetic: watered the plants{Enter}');
    await user.type(add, 'Synthetic: a win to remove{Enter}');
    expect(winItems()).toHaveLength(3);

    const first = within(winItems()[0]).getByRole('textbox', { name: 'Small win 1' });
    await user.clear(first);
    expect(within(winItems()[0]).getByText('A small win needs some words. Remove it if you prefer.')).toBeInTheDocument();
    await user.type(first, 'Synthetic: called a friend back');
    await user.click(within(winItems()[1]).getByRole('checkbox', { name: 'Include in insights' }));
    await user.click(within(winItems()[2]).getByRole('button', { name: 'Remove small win 3' }));
    await waitForSaved();

    const entry = await onlyEntry(api);
    expect(entry.wins.map(({ text, origin, includeInInsights }) => ({ text, origin, includeInInsights }))).toEqual([
      { text: 'Synthetic: called a friend back', origin: 'manual', includeInInsights: true },
      { text: 'Synthetic: watered the plants', origin: 'manual', includeInInsights: false },
    ]);
  });

  it('accepts "Nothing to add today" without storing anything', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    await user.click(screen.getByRole('button', { name: 'Nothing to add today' }));
    expect(screen.getByText("Nothing to add today. That's fine.")).toBeInTheDocument();
    expect(await api.entriesOn('2026-11-22')).toEqual([]);
    await typeInEditor(user, 'Synthetic: a plain day.');
    await waitForSaved();
    expect((await onlyEntry(api)).wins).toEqual([]);
  });

  it('keeps a multi-line answer added as a small win, line breaks included, when it is edited', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    await user.type(screen.getByRole('textbox', { name: 'What am I proud of?' }), 'Finished the report{Enter}Called a friend');
    await user.click(screen.getByRole('button', { name: 'Add as a small win' }));
    const win = within(winItems()[0]).getByRole('textbox', { name: 'Small win 1' });
    expect(win).toHaveValue('Finished the report\nCalled a friend');
    await user.type(win, '!');
    await waitFor(
      async () => expect((await onlyEntry(api)).wins.map((item) => item.text)).toEqual(['Finished the report\nCalled a friend!']),
      { timeout: SAVE_TIMEOUT_MS },
    );
  });
});

describe('Text typed into an add field', () => {
  it('keeps a small win typed but not added when Continue is pressed', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    await user.type(winField(), 'Synthetic: called a friend');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitForStoredWin(api, 'Synthetic: called a friend');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(within(winItems()[0]).getByRole('textbox', { name: 'Small win 1' })).toHaveValue('Synthetic: called a friend');
    expect(winField()).toHaveValue('');
  });

  it('keeps an Evening activity typed but not added when the stage is skipped', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await user.click(screen.getByRole('tab', { name: /^Evening/ }));
    await screen.findByRole('textbox', { name: /^Evening journal, / });
    await goToStage(user, 'What I did');
    await user.type(screen.getByRole('textbox', { name: 'Something else' }), 'Synthetic: repotted a fern');
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(
      async () =>
        expect((await onlyEntry(api)).actions.map((action) => [action.category, action.text])).toEqual([
          ['', 'Synthetic: repotted a fern'],
        ]),
      { timeout: SAVE_TIMEOUT_MS },
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('list', { name: 'Your own activities' })).toHaveTextContent('Synthetic: repotted a fern');
    expect(screen.getByRole('textbox', { name: 'Something else' })).toHaveValue('');
  });

  it('keeps a typed small win when another step is chosen from the step list', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    await user.type(winField(), 'Synthetic: watered the plants');
    await goToStage(user, 'What helped');
    await waitForStoredWin(api, 'Synthetic: watered the plants');
  });

  it('keeps a typed small win when the depth changes', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    await user.type(winField(), 'Synthetic: made soup');
    await user.click(screen.getByRole('radio', { name: /^Quick Check-in/ }));
    await waitForStoredWin(api, 'Synthetic: made soup');
    await user.click(screen.getByRole('radio', { name: /^Daily Journal/ }));
    await goToStage(user, 'Small wins and pride');
    expect(within(winItems()[0]).getByRole('textbox', { name: 'Small win 1' })).toHaveValue('Synthetic: made soup');
  });

  it('keeps a typed small win when the other slot is opened', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api, { delay: 60_000 });
    await goToStage(user, 'Small wins and pride');
    await user.type(winField(), 'Synthetic: a kind word');
    await user.click(screen.getByRole('tab', { name: /^Evening/ }));
    await screen.findByRole('textbox', { name: /^Evening journal, / });
    expect(await storedWins(api)).toEqual([{ text: 'Synthetic: a kind word', origin: 'manual' }]);
    expect((await onlyEntry(api)).slot).toBe('morning');
  });

  it('keeps a typed small win when another date is opened', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api, { delay: 60_000 });
    await goToStage(user, 'Small wins and pride');
    await user.type(winField(), 'Synthetic: an early night');
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByRole('heading', { level: 1, name: 'Saturday 21 November 2026' });
    expect(await storedWins(api)).toEqual([{ text: 'Synthetic: an early night', origin: 'manual' }]);
  });

  it('keeps a typed small win when the app quits, and shows it after reopening', async () => {
    const user = userEvent.setup();
    const { api, restart } = createJournal();
    const first = await renderToday(api, { delay: 60_000 });
    await goToStage(user, 'Small wins and pride');
    await user.type(winField(), 'Synthetic: finished a puzzle');
    expect(await api.entriesOn(DATE)).toEqual([]);
    // What the quit request does before the app exits.
    await act(async () => {
      await flushAll();
    });
    expect(await storedWins(api)).toEqual([{ text: 'Synthetic: finished a puzzle', origin: 'manual' }]);
    first.unmount();

    await renderToday(restart());
    await goToStage(user, 'Small wins and pride');
    expect(within(winItems()[0]).getByRole('textbox', { name: 'Small win 1' })).toHaveValue('Synthetic: finished a puzzle');
  });

  it('removes the typed item when the field is cleared again', async () => {
    const user = userEvent.setup();
    const { api } = createJournal();
    await renderToday(api);
    await goToStage(user, 'Small wins and pride');
    await user.type(winField(), 'Synthetic: second thoughts');
    await user.clear(winField());
    await chooseScore(user, 'How proud do I feel?', 6);
    await waitFor(async () => expect(await onlyEntry(api)).toMatchObject({ pride: 6, wins: [] }), {
      timeout: SAVE_TIMEOUT_MS,
    });
    expect(screen.queryByRole('list', { name: 'Small wins' })).not.toBeInTheDocument();
  });
});

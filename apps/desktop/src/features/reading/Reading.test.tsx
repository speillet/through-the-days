import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { App } from '../../App';
import { createMemoryApi, createMemoryStorage } from '../../api/memory';
import { newDraft, promotePride } from '../../domain/entry';

it('opens both calendar slots and reads a complete long entry once in Book View', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  const draft = newDraft('2026-11-22', 'morning', 'Europe/Paris');
  draft.mood = 5;
  draft.energy = 3;
  draft.document = {
    type: 'doc',
    content: Array.from({ length: 140 }, (_, index) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Synthetic passage ${index + 1}.` }],
    })),
  };
  await api.saveEntry(draft);
  await api.saveEntry({ ...newDraft('2026-11-22', 'evening', 'Europe/Paris'), mood: 7, energy: 6 });
  render(<App api={api} initialView="calendar" />);
  const user = userEvent.setup();
  expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
  expect(await screen.findByText('Mood 5/10 (neutral)')).toBeInTheDocument();
  expect(screen.getByText('Mood 7/10')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Read Morning in Book View' }));
  const article = await screen.findByRole('article', { name: 'Morning journal entry' });
  expect(within(article).getByText('Synthetic passage 1.')).toBeInTheDocument();
  expect(within(article).getAllByText('Synthetic passage 140.')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Next entry' }));
  expect(await screen.findByRole('article', { name: 'Evening journal entry' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Return to Calendar' }));
  expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
});

it('retains weekly notes across a failed save and view changes, then retries without data loss', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  vi.spyOn(api, 'saveWeeklyNotes').mockRejectedValueOnce({
    code: 'storage',
    message: 'Synthetic note save failed.',
  });
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Monday 16 November 2026 to Sunday 22 November 2026' });
  await user.type(
    screen.getByRole('textbox', { name: 'Your notes' }),
    'Synthetic weekly reflection to keep.',
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic note save failed.');
  await user.click(screen.getByRole('button', { name: 'Calendar' }));
  await user.click(screen.getByRole('button', { name: 'Weekly Review' }));
  expect(await screen.findByRole('textbox', { name: 'Your notes' })).toHaveValue(
    'Synthetic weekly reflection to keep.',
  );
  await user.click(screen.getByRole('button', { name: 'Retry saving notes' }));
  await waitFor(async () =>
    expect((await api.weeklyReview('2026-11-22')).notes).toBe('Synthetic weekly reflection to keep.'),
  );
});

it('adds, edits and removes a private milestone through the long-range view', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  render(<App api={api} initialView="path" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Add milestone' }));
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Synthetic meaningful pause');
  await user.click(screen.getByRole('button', { name: 'Save milestone' }));
  expect(await screen.findByRole('heading', { name: 'Synthetic meaningful pause' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Edit milestone' }));
  await user.type(screen.getByRole('textbox', { name: 'Title' }), ' revisited');
  await user.click(screen.getByRole('button', { name: 'Save milestone' }));
  expect(
    await screen.findByRole('heading', { name: 'Synthetic meaningful pause revisited' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete milestone' }));
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete milestone' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Synthetic meaningful pause revisited' }),
    ).not.toBeInTheDocument(),
  );
  expect(await api.listMilestones()).toEqual([]);
});

it('combines local search with slot filters and opens the exact saved source', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  // Deliberate multilingual synthetic fixture.
  const entry = {
    ...newDraft('2026-11-21', 'evening', 'Europe/Paris'),
    document: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic journée paisible 🌿' }] }],
    },
  };
  await api.saveEntry(entry);
  render(<App api={api} initialView="journal" />);
  const user = userEvent.setup();
  await user.type(await screen.findByRole('searchbox', { name: 'Search journal' }), 'journee');
  expect(await screen.findByText('Synthetic journée paisible 🌿')).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Slot filter' }), 'morning');
  await waitFor(() => expect(screen.queryByText('Synthetic journée paisible 🌿')).not.toBeInTheDocument());
  await user.selectOptions(screen.getByRole('combobox', { name: 'Slot filter' }), '');
  await user.click(await screen.findByRole('button', { name: 'Edit Evening entry from 21 November 2026' }));
  expect(await screen.findByRole('textbox', { name: /Evening journal/ })).toHaveTextContent(
    'Synthetic journée paisible 🌿',
  );
});

it('finds a partly bold word by the whole word and shows its excerpt without added line breaks', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  const excerpt = 'Synthetic peaceful afternoon. I felt calm today.';
  await api.saveEntry({
    ...newDraft('2026-11-21', 'evening', 'Europe/Paris'),
    document: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Synthetic peaceful ' },
            { type: 'text', text: 'after', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'noon. I felt ' },
            { type: 'text', text: 'calm', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' today.' },
          ],
        },
      ],
    },
  });
  render(<App api={api} initialView="journal" />);
  const user = userEvent.setup();
  const search = await screen.findByRole('searchbox', { name: 'Search journal' });
  // Pasting sends each query whole: no partial or empty query can show the entry in between.
  await user.click(search);
  await user.paste('after');
  expect(await screen.findByText('No entries match these filters.')).toBeInTheDocument();
  await user.paste('noon');
  expect(search).toHaveValue('afternoon');
  expect((await screen.findByText(excerpt)).textContent).toBe(excerpt);
});

it('keeps historical timeline ranges, slot values and gaps, and remembers every hidden series', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  await api.saveEntry({ ...newDraft('2026-11-20', 'morning', 'Europe/Paris'), mood: 2, energy: 3 });
  await api.saveEntry({ ...newDraft('2026-11-20', 'evening', 'Europe/Paris'), mood: 7, energy: 6 });
  const mounted = render(<App api={api} initialView="trends" />);
  const user = userEvent.setup();
  fireEvent.change(await screen.findByLabelText('Ending on'), { target: { value: '2026-11-20' } });
  const timeline = await screen.findByRole('list', { name: 'Recorded days and gaps' });
  await waitFor(() => expect(within(timeline).getAllByRole('listitem')).toHaveLength(14));
  expect(timeline.querySelector('time')).toHaveAttribute('datetime', '2026-11-07');
  expect(within(timeline).getByText('Mood 2/10')).toBeInTheDocument();
  expect(within(timeline).getByText('Mood 7/10')).toBeInTheDocument();
  expect(within(timeline).getAllByText('Pride —')).toHaveLength(2);
  expect(within(timeline).getAllByText('No entry')).toHaveLength(13);
  await user.click(screen.getByRole('button', { name: '7 days' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('list', { name: 'Recorded days and gaps' })).getAllByRole('listitem'),
    ).toHaveLength(7),
  );
  await user.click(screen.getByRole('button', { name: '30 days' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('list', { name: 'Recorded days and gaps' })).getAllByRole('listitem'),
    ).toHaveLength(30),
  );
  for (const name of ['Mood', 'Energy', 'Pride', 'Perceived progress']) {
    await user.click(screen.getByRole('checkbox', { name }));
  }
  await waitFor(async () => expect((await api.getPreferences()).timelineMetrics).toEqual([]));
  mounted.unmount();
  render(<App api={api} initialView="trends" />);
  fireEvent.change(await screen.findByLabelText('Ending on'), { target: { value: '2026-11-20' } });
  for (const name of ['Mood', 'Energy', 'Pride', 'Perceived progress']) {
    expect(await screen.findByRole('checkbox', { name })).not.toBeChecked();
  }
  const restored = await screen.findByRole('list', { name: 'Recorded days and gaps' });
  expect(within(restored).getAllByRole('listitem')).toHaveLength(30);
  expect(restored.querySelector('time')).toHaveAttribute('datetime', '2026-10-22');
  expect(within(restored).queryByText(/Mood \d/)).not.toBeInTheDocument();
  const days = within(restored).getAllByRole('listitem');
  within(days[days.length - 1])
    .getByRole('button')
    .focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Friday 20 November 2026');
});

it('reviews three scored drafts on two dates as two days and keeps weekly notes outside the counts', async () => {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  const morning = newDraft('2026-11-20', 'morning', 'Europe/Paris');
  morning.mood = 2;
  morning.energy = 3;
  morning.pride = 9;
  morning.reflection.proudOf = 'Synthetic: made room for rest.';
  morning.actions = [{ id: 'synthetic-rest', text: 'Synthetic rest', category: 'rest' }];
  await api.saveEntry(promotePride(promotePride(morning)));
  await api.saveEntry({ ...newDraft('2026-11-20', 'evening', 'Europe/Paris'), mood: 7, progress: 8 });
  await api.saveEntry({ ...newDraft('2026-11-22', 'morning', 'Europe/Paris'), mood: 6, energy: 9 });
  await api.saveEntry(newDraft('2026-11-23', 'morning', 'Europe/Paris'));
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  expect(await screen.findByText(/2 recorded days of 7; 3 saved entries/)).toBeInTheDocument();
  expect(screen.getByText('Mean 5/10, n=3')).toBeInTheDocument();
  expect(screen.getByText('Mean 6/10, n=2')).toBeInTheDocument();
  expect(screen.getByText('Mean 5/10, n=3').closest('dd')).toHaveTextContent('2 recorded days of 7');
  expect(screen.getByText('Mean 9/10, n=1').closest('dd')).toHaveTextContent('1 recorded day of 7');
  expect(screen.getByText(/1 approved small win and 1 reported action/)).toBeInTheDocument();
  expect(screen.getByText(/CBT exercises are not available yet and are not counted/)).toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Your notes' }), 'Synthetic weekly notes.');
  await user.click(screen.getByRole('button', { name: 'Save notes' }));
  await waitFor(async () =>
    expect((await api.weeklyReview('2026-11-22')).notes).toBe('Synthetic weekly notes.'),
  );
  expect(screen.getByText(/2 recorded days of 7; 3 saved entries/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Previous week' }));
  expect(await screen.findByText(/0 recorded days of 7; 0 saved entries/)).toBeInTheDocument();
  expect(screen.getByText(/No recorded entries in this week/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next week' }));
  expect(await screen.findByRole('textbox', { name: 'Your notes' })).toHaveValue('Synthetic weekly notes.');
});

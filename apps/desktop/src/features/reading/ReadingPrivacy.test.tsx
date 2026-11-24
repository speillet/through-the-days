import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../../App';
import { createMemoryApi, createMemoryStorage } from '../../api/memory';
import { newDraft, newId } from '../../domain/entry';

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

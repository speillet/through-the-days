import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../../App';
import { createMemoryApi, createMemoryStorage } from '../../api/memory';
import { newDraft } from '../../domain/entry';

async function journal() {
  const api = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  for (const [date, slot, text] of [
    ['2026-10-01', 'morning', 'Synthetic scoped older writing.'],
    ['2026-11-20', 'morning', 'Synthetic scoped morning.'],
    ['2026-11-20', 'evening', 'Synthetic scoped evening.'],
  ] as const) {
    await api.saveEntry({
      ...newDraft(date, slot, 'Europe/Paris'),
      document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    });
  }
  return api;
}

it('reads a timeline selection without changing the journal filters or its return context', async () => {
  const api = await journal();
  render(<App api={api} initialView="path" />);
  const user = userEvent.setup();
  await user.type(await screen.findByRole('searchbox', { name: 'Search journal' }), 'scoped');
  await user.click(screen.getByRole('checkbox', { name: 'Private milestones' }));
  await user.click(await screen.findByRole('button', { name: 'Read Morning in Book View' }));
  expect(await screen.findByText('Entry 1 of 2')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next entry' }));
  expect(await screen.findByRole('article', { name: 'Evening journal entry' })).toHaveTextContent(
    'Synthetic scoped evening.',
  );
  await user.click(screen.getByRole('button', { name: 'Return to The Path So Far' }));
  expect(await screen.findByRole('searchbox', { name: 'Search journal' })).toHaveValue('scoped');
  expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('checkbox', { name: 'Private milestones' })).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  expect(screen.getByLabelText('From')).toHaveValue('');
  expect(screen.getByLabelText('To')).toHaveValue('');
  expect(await screen.findByText('Synthetic scoped older writing.')).toBeInTheDocument();
});

it('zooms out from a custom range without narrowing it, and pans by the displayed civil dates', async () => {
  const api = await journal();
  render(<App api={api} initialView="path" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Custom range' }));
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-22' } });
  screen.getByRole('button', { name: 'Zoom out' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  screen.getByRole('button', { name: 'Zoom in' }).focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Earlier range' }));
  expect(
    await screen.findByText(
      'No records in the selected layers from Monday 9 November 2026 to Sunday 15 November 2026.',
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Custom range' }));
  await user.click(screen.getByRole('button', { name: 'Earlier range' }));
  expect(screen.getByLabelText('From')).toHaveValue('2026-11-02');
  expect(screen.getByLabelText('To')).toHaveValue('2026-11-08');
  await user.click(screen.getByRole('button', { name: 'End today' }));
  expect(screen.getByLabelText('From')).toHaveValue('2026-11-16');
  expect(screen.getByLabelText('To')).toHaveValue('2026-11-22');
  await user.click(screen.getByRole('button', { name: '90 days' }));
  expect(await screen.findByText('Synthetic scoped older writing.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '1 year' }));
  expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  await waitFor(() => expect(screen.queryByText('Opening recorded moments…')).not.toBeInTheDocument());
});

it('opens an exact weekly source despite journal filters and returns to the same authored review', async () => {
  const api = await journal();
  render(<App api={api} initialView="journal" />);
  const user = userEvent.setup();
  await user.type(await screen.findByRole('searchbox', { name: 'Search journal' }), 'older');
  await user.click(screen.getByRole('button', { name: 'Weekly Review' }));
  await user.type(
    await screen.findByRole('textbox', { name: 'Your notes' }),
    'Synthetic notes to return to.',
  );
  await user.click(await screen.findByRole('button', { name: 'Read Evening in Book View' }));
  expect(await screen.findByRole('article', { name: 'Evening journal entry' })).toHaveTextContent(
    'Synthetic scoped evening.',
  );
  await user.click(screen.getByRole('button', { name: 'Return to Weekly Review' }));
  expect(await screen.findByRole('textbox', { name: 'Your notes' })).toHaveValue(
    'Synthetic notes to return to.',
  );
  expect(
    screen.getByRole('heading', { name: 'Monday 16 November 2026 to Sunday 22 November 2026' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  expect(await screen.findByRole('searchbox', { name: 'Search journal' })).toHaveValue('older');
});

it('keeps a custom timeline range independent of the journal date filters', async () => {
  const api = await journal();
  render(<App api={api} initialView="journal" />);
  const user = userEvent.setup();
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-22' } });
  await user.click(screen.getByRole('button', { name: 'The Path So Far' }));
  await user.click(await screen.findByRole('button', { name: 'Custom range' }));
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-16' } });
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  await user.click(await screen.findByText('More filters', { selector: 'summary' }));
  expect(screen.getByLabelText('From')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('To')).toHaveValue('2026-11-22');
  expect(await screen.findByText('Synthetic scoped older writing.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'The Path So Far' }));
  expect(await screen.findByLabelText('From')).toHaveValue('2026-11-16');
  expect(screen.getByLabelText('To')).toHaveValue('2026-11-22');
});

it('offers an explicit new reading selection when all scoped sources have been trashed', async () => {
  const api = await journal();
  render(<App api={api} initialView="path" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Read Morning in Book View' }));
  await screen.findByRole('article', { name: 'Morning journal entry' });
  await act(async () => {
    for (const entry of await api.entriesOn('2026-11-20')) await api.trashEntry(entry.id, entry.revision);
  });
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  await user.click(screen.getByRole('button', { name: 'Book View' }));
  expect(
    await screen.findByText('The selected entry is no longer available in this selection.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Start reading this selection' }));
  await user.click(await screen.findByRole('button', { name: 'Read all entries' }));
  expect(await screen.findByRole('article', { name: 'Morning journal entry' })).toHaveTextContent(
    'Synthetic scoped older writing.',
  );
});

it('retains a journal Book selection when shared filters change elsewhere', async () => {
  const api = await journal();
  render(<App api={api} initialView="journal" />);
  const user = userEvent.setup();
  await user.type(await screen.findByRole('searchbox', { name: 'Search journal' }), 'morning');
  await user.click(await screen.findByRole('button', { name: 'Read Morning in Book View' }));
  expect(await screen.findByRole('article', { name: 'Morning journal entry' })).toHaveTextContent(
    'Synthetic scoped morning.',
  );
  await user.click(screen.getByRole('button', { name: 'My Journal' }));
  const search = await screen.findByRole('searchbox', { name: 'Search journal' });
  await user.clear(search);
  await user.type(search, 'evening');
  expect(await screen.findByText('Synthetic scoped evening.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Book View' }));
  expect(await screen.findByRole('article', { name: 'Morning journal entry' })).toHaveTextContent(
    'Synthetic scoped morning.',
  );
  expect(screen.getByRole('button', { name: 'Next entry' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Return to My Journal' }));
  expect(await screen.findByRole('searchbox', { name: 'Search journal' })).toHaveValue('evening');
  expect(await screen.findByText('Synthetic scoped evening.')).toBeInTheDocument();
});

it('keeps Trends and its ending date when a typed year gains a fifth digit', async () => {
  const api = await journal();
  render(<App api={api} initialView="trends" />);
  const ending = await screen.findByLabelText('Ending on');
  expect(await screen.findByText('Monday 9 November 2026 to Sunday 22 November 2026')).toBeInTheDocument();
  // Date fields accept six-digit years: "2026" and a stray "1" give 20261-11-24.
  fireEvent.change(ending, { target: { value: '20261-11-24' } });
  expect(screen.getByRole('heading', { level: 1, name: 'Trends' })).toBeInTheDocument();
  expect(ending).toHaveValue('2026-11-22');
  expect(screen.getByText('Monday 9 November 2026 to Sunday 22 November 2026')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('stops day, week, range and month steps at 31 December 9999 and keeps that date', async () => {
  const api = await journal();
  render(<App api={api} initialView="trends" />);
  const user = userEvent.setup();
  fireEvent.change(await screen.findByLabelText('Ending on'), { target: { value: '9999-12-31' } });
  expect(await screen.findByText('Saturday 18 December 9999 to Friday 31 December 9999')).toBeInTheDocument();

  await user.click(screen.getByTitle('Friday 31 December 9999'));
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Friday 31 December 9999');
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'Weekly Review' }));
  expect(await screen.findByRole('button', { name: 'Next week' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous week' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'The Path So Far' }));
  expect(await screen.findByRole('button', { name: 'Later range' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Earlier range' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '1 year' }));
  expect(screen.getByRole('button', { name: 'Later range' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Custom range' }));
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '20261-11-24' } });
  expect(screen.getByLabelText('To')).toHaveValue('9999-12-31');
  expect(screen.getByRole('button', { name: 'Later range' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '30 days' }));

  await user.click(screen.getByRole('button', { name: 'Calendar' }));
  expect(await screen.findByRole('grid', { name: 'December 9999' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  expect(screen.getByRole('heading', { level: 2, name: 'Friday 31 December 9999' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Trends' }));
  expect(await screen.findByLabelText('Ending on')).toHaveValue('9999-12-31');
});

it('stops one-year and custom timelines and the weekly review at 1 January 0001', async () => {
  const api = await journal();
  render(<App api={api} initialView="trends" />);
  const user = userEvent.setup();
  fireEvent.change(await screen.findByLabelText('Ending on'), { target: { value: '0001-11-24' } });
  await user.click(screen.getByRole('button', { name: 'The Path So Far' }));
  await user.click(await screen.findByRole('button', { name: '1 year' }));
  expect(screen.getByRole('button', { name: 'Earlier range' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Later range' })).toBeEnabled();

  // A custom range stops where its From date would pass 1 January 0001; a typed From with a
  // fifth year digit is ignored.
  await user.click(screen.getByRole('button', { name: 'Custom range' }));
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '0001-01-01' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '0001-01-10' } });
  expect(screen.getByText(/^Monday 1 January 1 to Wednesday 10 January 1\./)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Earlier range' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Later range' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '20261-11-24' } });
  expect(screen.getByLabelText('From')).toHaveValue('0001-01-01');
  expect(screen.getByRole('button', { name: 'Earlier range' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Trends' }));
  fireEvent.change(await screen.findByLabelText('Ending on'), { target: { value: '0001-01-05' } });
  await user.click(screen.getByRole('button', { name: 'Weekly Review' }));
  expect(
    await screen.findByRole('heading', { name: 'Monday 1 January 1 to Sunday 7 January 1' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous week' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled();
});

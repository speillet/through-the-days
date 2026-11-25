import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

it('pages a one-year range by 365 days, so no date appears on two pages, 29 February included', async () => {
  const api = await journal();
  render(<App api={api} initialView="trends" />);
  const user = userEvent.setup();
  fireEvent.change(await screen.findByLabelText('Ending on'), { target: { value: '2024-02-29' } });
  await user.click(screen.getByRole('button', { name: 'The Path So Far' }));
  await user.click(await screen.findByRole('button', { name: '1 year' }));
  const shown = (range: string) => screen.getByText(new RegExp(`^${range}\\.`));
  expect(shown('Thursday 2 March 2023 to Thursday 29 February 2024')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Later range' }));
  expect(shown('Friday 1 March 2024 to Friday 28 February 2025')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Earlier range' }));
  expect(shown('Thursday 2 March 2023 to Thursday 29 February 2024')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Earlier range' }));
  expect(shown('Wednesday 2 March 2022 to Wednesday 1 March 2023')).toBeInTheDocument();
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

/** Calendar's own Today control, not the navigation's Today view. */
function calendarToday() {
  return within(screen.getByRole('main')).getByRole('button', { name: 'Today' });
}

/** Moves the synthetic clock and lets the app notice, as when the window is activated again. */
function passTime(clock: { set(next: Date): void }, next: Date) {
  clock.set(next);
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

function clockedJournal(start: Date) {
  let now = start;
  const api = createMemoryApi({ storage: createMemoryStorage(), now: () => now });
  return { api, clock: { set: (next: Date) => (now = next) } };
}

it("returns Calendar to today's month with Today after paging, also when today is already chosen", async () => {
  const api = await journal();
  render(<App api={api} initialView="calendar" />);
  const user = userEvent.setup();
  const todayCell = () => screen.getByRole('button', { name: 'Sunday 22 November 2026, today' });
  expect(await screen.findByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
  // With no date chosen, with today's cell chosen, and after Today itself.
  for (const choose of [async () => {}, () => user.click(todayCell()), () => user.click(calendarToday())]) {
    await choose();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeInTheDocument();
    await user.click(calendarToday());
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    expect(todayCell()).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('heading', { level: 2, name: 'Sunday 22 November 2026' })).toBeInTheDocument();
  }
});

it('follows today past midnight after Today in Calendar, in Calendar and Trends', async () => {
  // 22:00 in Paris on Tuesday 24 November 2026.
  const { api, clock } = clockedJournal(new Date('2026-11-24T21:00:00Z'));
  render(<App api={api} initialView="calendar" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Friday 20 November 2026' }));
  expect(screen.getByRole('heading', { level: 2, name: 'Friday 20 November 2026' })).toBeInTheDocument();
  await user.click(calendarToday());
  expect(screen.getByRole('heading', { level: 2, name: 'Tuesday 24 November 2026' })).toBeInTheDocument();

  passTime(clock, new Date('2026-11-24T23:10:00Z')); // 00:10 on Wednesday 25 November.
  expect(
    await screen.findByRole('heading', { level: 2, name: 'Wednesday 25 November 2026' }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Wednesday 25 November 2026, today' })).toHaveAttribute(
      'tabindex',
      '0',
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Trends' }));
  expect(await screen.findByLabelText('Ending on')).toHaveValue('2026-11-25');
});

it('follows today into the new week past midnight after This week', async () => {
  // 22:00 in Paris on Sunday 29 November 2026.
  const { api, clock } = clockedJournal(new Date('2026-11-29T21:00:00Z'));
  render(<App api={api} initialView="weekly" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Previous week' }));
  expect(
    await screen.findByRole('heading', { name: 'Monday 16 November 2026 to Sunday 22 November 2026' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'This week' }));
  expect(
    await screen.findByRole('heading', { name: 'Monday 23 November 2026 to Sunday 29 November 2026' }),
  ).toBeInTheDocument();

  passTime(clock, new Date('2026-11-29T23:10:00Z')); // 00:10 on Monday 30 November.
  expect(
    await screen.findByRole('heading', { name: 'Monday 30 November 2026 to Sunday 6 December 2026' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Trends' }));
  expect(await screen.findByLabelText('Ending on')).toHaveValue('2026-11-30');
});

it('follows today past midnight after End today on a preset range in The Path So Far', async () => {
  // 22:00 in Paris on Sunday 29 November 2026.
  const { api, clock } = clockedJournal(new Date('2026-11-29T21:00:00Z'));
  render(<App api={api} initialView="path" />);
  const user = userEvent.setup();
  const range = (text: string) => screen.getByText(new RegExp(`^${text}\\.`));
  await user.click(await screen.findByRole('button', { name: '7 days' }));
  await user.click(screen.getByRole('button', { name: 'Earlier range' }));
  expect(range('Monday 16 November 2026 to Sunday 22 November 2026')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'End today' }));
  expect(range('Monday 23 November 2026 to Sunday 29 November 2026')).toBeInTheDocument();

  passTime(clock, new Date('2026-11-29T23:10:00Z')); // 00:10 on Monday 30 November.
  await waitFor(() =>
    expect(range('Tuesday 24 November 2026 to Monday 30 November 2026')).toBeInTheDocument(),
  );
  await user.click(screen.getByRole('button', { name: 'Add milestone' }));
  const dialog = screen.getByRole('dialog', { name: 'Add milestone' });
  expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-30');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Trends' }));
  expect(await screen.findByLabelText('Ending on')).toHaveValue('2026-11-30');
});

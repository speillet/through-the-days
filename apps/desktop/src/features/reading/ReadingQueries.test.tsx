import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../../App';
import type { JournalApi } from '../../api/client';
import type { Entry } from '../../api/types';
import { createMemoryApi, createMemoryStorage } from '../../api/memory';
import { newDraft } from '../../domain/entry';

it('does not restore an obsolete search response after the selection has changed', async () => {
  const journal = createMemoryApi({
    storage: createMemoryStorage(),
    now: () => new Date('2026-11-22T12:00:00Z'),
  });
  const saved: Entry[] = [];
  for (const [slot, text] of [
    ['morning', 'Synthetic obsolete result.'],
    ['evening', 'Synthetic current result.'],
  ] as const) {
    saved.push(
      await journal.saveEntry({
        ...newDraft('2026-11-22', slot, 'Europe/Paris'),
        document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      }),
    );
  }
  let completeInitial!: (entries: Entry[]) => void;
  const initial = new Promise<Entry[]>((resolve) => {
    completeInitial = resolve;
  });
  const api: JournalApi = {
    ...journal,
    searchEntries: (request) => (request.text ? journal.searchEntries(request) : initial),
  };
  render(<App api={api} initialView="journal" />);
  await userEvent.setup().type(await screen.findByRole('searchbox', { name: 'Search journal' }), 'current');
  expect(await screen.findByText('Synthetic current result.')).toBeInTheDocument();
  await act(async () => {
    completeInitial(saved);
  });
  expect(screen.queryByText('Synthetic obsolete result.')).not.toBeInTheDocument();
  expect(screen.getByText('Synthetic current result.')).toBeInTheDocument();
});

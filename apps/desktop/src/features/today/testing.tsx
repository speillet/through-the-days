// Test helpers for the Today view: a synthetic journal with a controllable clock,
// a restart over the same storage, and queries for the writing surface.
// Used by tests only; every fixture is fictional.

import { act, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';
import type { JournalApi } from '../../api/client';
import { createMemoryStorage } from '../../api/memory';
import type { Entry, Preferences } from '../../api/types';
import { documentText } from '../../domain/entry';
import { DEFAULT_PREFERENCES } from '../../domain/preferences';
import { createTestApi, createTestClock, renderWithProviders, TEST_NOW } from '../../test/render';
import { TodayView } from './TodayView';

/** Sunday 22 November 2026, TEST_NOW's journal date in Europe/Paris. */
export const DATE = '2026-11-22';

export function createJournal(start: Date = TEST_NOW) {
  const storage = createMemoryStorage();
  const clock = createTestClock(start);
  const open = () => createTestApi({ storage, now: clock.now });
  return { api: open(), storage, clock, restart: open };
}

export async function setPreferences(api: JournalApi, changes: Partial<Preferences>) {
  await api.setPreferences({ ...DEFAULT_PREFERENCES, ...(await api.getPreferences()), ...changes });
}

export async function renderToday(api: JournalApi, { delay = 10 }: { delay?: number } = {}) {
  const view = renderWithProviders(<TodayView autosaveDelayMs={delay} />, { api });
  await screen.findByRole('textbox', { name: / journal, / });
  return view;
}

export function journalEditor(slot: 'Morning' | 'Evening' = 'Morning'): HTMLElement {
  return screen.getByRole('textbox', { name: new RegExp(`^${slot} journal, `) });
}

/**
 * Types at the end of the writing, like a person clicking after their last word.
 * (user-event's own click misplaces the caret in a jsdom contenteditable, and
 * Tiptap defers focus to the next frame outside WebKit.)
 */
export async function typeInEditor(user: UserEvent, text: string, slot: 'Morning' | 'Evening' = 'Morning') {
  const element = journalEditor(slot);
  const editor = (element as HTMLElement & { editor?: Editor }).editor;
  if (!editor) throw new Error('The journal editor is not ready.');
  act(() => {
    element.focus({ preventScroll: true });
    editor.commands.focus('end');
  });
  await user.keyboard(text);
}

/** Generous, so a busy machine does not turn a slow save into a failure. */
export const SAVE_TIMEOUT_MS = 4_000;

export async function waitForSaved() {
  await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: SAVE_TIMEOUT_MS });
}

export function scale(name: string | RegExp): HTMLElement {
  return screen.getByRole('group', { name });
}

export async function chooseScore(user: UserEvent, name: string | RegExp, value: number) {
  await user.click(within(scale(name)).getByRole('radio', { name: new RegExp(`^${value}(,|$)`) }));
}

export function checkedScore(name: string | RegExp): number | null {
  const checked = within(scale(name))
    .getAllByRole('radio')
    .find((radio) => (radio as HTMLInputElement).checked);
  return checked ? Number((checked as HTMLInputElement).value) : null;
}

export async function goToStage(user: UserEvent, title: string | RegExp) {
  await user.click(within(screen.getByRole('list', { name: 'Check-in steps' })).getByRole('button', { name: title }));
}

export function textOf(entry: Entry): string {
  return documentText(entry.document);
}

export async function onlyEntry(api: JournalApi, date: string = DATE): Promise<Entry> {
  const entries = await api.entriesOn(date);
  expect(entries).toHaveLength(1);
  return entries[0];
}

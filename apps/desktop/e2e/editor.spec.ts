// The journal editor in real engines: Command-B and Command-I mark the saved
// document, Escape leaves focus mode while the writing has focus, and a slot
// reopened after switching shows its saved writing and keeps saving on top of it.

import type { Page } from '@playwright/test';
import type { Entry } from '../src/api/types';
import { expect, storedJournal, test } from './fixtures';

function journalPage(page: Page, slot: 'Morning' | 'Evening' = 'Morning') {
  return page.getByRole('textbox', { name: new RegExp(`^${slot} journal, Sunday 22 November 2026`) });
}

function saveStatus(page: Page) {
  return page.getByRole('status').filter({ hasText: /^(Saving…|Saved|Couldn't save)$/ });
}

function documentText(entry: Entry): string {
  const walk = (node: Entry['document']): string =>
    typeof node.text === 'string' ? node.text : (node.content ?? []).map(walk).join('\n');
  return walk(entry.document);
}

async function savedEntries(page: Page): Promise<Entry[]> {
  const journal = await storedJournal(page).catch(() => null);
  return journal ? journal.journal.entries.filter((item) => item.trashedAt === null).map((item) => item.entry) : [];
}

test('formats with Command-B and Command-I and saves bold and italic marks', async ({ page }) => {
  await page.goto('/');
  const editor = journalPage(page);
  await editor.click();
  await expect(editor).toBeFocused();
  // On macOS, where the suite runs, ControlOrMeta is the Command key, and the editor
  // binds its shortcuts to Command only when the page reports a Mac.
  if (process.platform === 'darwin') expect(await page.evaluate(() => navigator.platform)).toMatch(/^Mac/);
  await page.keyboard.type('Plain ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type(' and ');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type('slanted');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type('.');
  await expect(editor.locator('strong')).toHaveText('bold');
  await expect(editor.locator('em')).toHaveText('slanted');

  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveText('Saved');
  await expect
    .poll(async () => (await savedEntries(page))[0]?.document.content?.[0]?.content)
    .toEqual([
      { type: 'text', text: 'Plain ' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'slanted', marks: [{ type: 'italic' }] },
      { type: 'text', text: '.' },
    ]);
});

test('leaves focus mode with Escape while the writing has focus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Focus mode' }).click();
  const editor = journalPage(page);
  await expect(editor).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('tablist', { name: 'Entries for this date' })).toBeHidden();
  await page.keyboard.type('Fictional focused words.');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Focus mode' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Entries for this date' })).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Fictional focused words.');
});

test('reopens a slot on its saved writing after switching slots, and saves the next edit on top', async ({ page }) => {
  await page.goto('/');
  const morning = journalPage(page, 'Morning');
  await morning.click();
  const originalText = 'Fictional morning words.';
  await page.keyboard.type(originalText);
  await expect.poll(async () => (await savedEntries(page)).map(documentText)).toEqual([originalText]);
  await expect(saveStatus(page)).toHaveText('Saved');
  const [original] = await savedEntries(page);

  await page.getByRole('tab', { name: /^Evening/ }).click();
  await expect(journalPage(page, 'Evening')).toBeVisible();
  await page.getByRole('tab', { name: /^Morning/ }).click();
  await expect(morning).toHaveText(originalText);
  await expect(page.getByRole('tab', { name: /^Morning/ })).toContainText('Draft');

  // Write directly puts the caret after the last word.
  await page.getByRole('button', { name: 'Write directly' }).click();
  await expect(morning).toBeFocused();
  await page.keyboard.type(' More');
  await expect.poll(async () => (await savedEntries(page)).map(documentText)).toEqual([`${originalText} More`]);
  await page.keyboard.type('.');
  await expect
    .poll(async () => (await savedEntries(page)).map((entry) => [entry.id, documentText(entry)]))
    .toEqual([[original.id, `${originalText} More.`]]);
  expect((await savedEntries(page))[0].revision).toBeGreaterThan(original.revision);
  await expect(saveStatus(page)).toHaveText('Saved');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

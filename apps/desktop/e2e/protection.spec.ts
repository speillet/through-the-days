// Trash, simulated encrypted backups, restore and erasure in the browser preview.
// The preview simulates the native backup commands; nothing is encrypted or written
// to disk here, but the interface meets the same states, rules and errors.

import type { Page } from '@playwright/test';
import { entry, expect, openView, seedJournal, storedJournal, test, type Seed } from './fixtures';

const PASSPHRASE = 'fictional-quiet-harbour';

test('restores, refuses an occupied slot and deletes permanently from the trash', async ({ page }) => {
  const kept = entry('2026-11-21', 'morning', 'Fictional replacement written after the deletion.');
  const occupied = entry('2026-11-21', 'morning', 'Fictional first draft, deleted.');
  const free = entry('2026-11-20', 'evening', 'Fictional evening entry, deleted by mistake.', { mood: 6, energy: 4 });
  await seedJournal(page, { active: [kept], trashed: [{ entry: occupied }, { entry: free }] });
  await openView(page, 'Trash');

  const freeItem = page.getByRole('listitem').filter({ hasText: 'Fictional evening entry, deleted by mistake.' });
  await expect(freeItem.getByRole('heading', { level: 2 })).toHaveText(/Friday 20 November 2026.*Evening/);
  await expect(freeItem).toContainText('Deleted 22 November 2026 at 10:00');
  await expect(freeItem).toContainText('Kept until 22 December 2026');
  await freeItem.getByRole('button', { name: /^Restore/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'is back in your journal' })).toContainText(
    'The Evening entry from Friday 20 November 2026 is back in your journal.',
  );

  const occupiedItem = page.getByRole('listitem').filter({ hasText: 'Fictional first draft, deleted.' });
  await occupiedItem.getByRole('button', { name: /^Restore/ }).click();
  await expect(occupiedItem.getByRole('alert')).toContainText('Saturday 21 November 2026 already has a Morning entry');
  await expect(occupiedItem.getByRole('alert')).toContainText('Nothing was overwritten: both entries are kept.');

  await occupiedItem.getByRole('button', { name: /^Delete permanently/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete this entry permanently?' });
  await expect(dialog).toContainText('You can’t undo this.');
  await expect(dialog).toContainText('Earlier encrypted backups may still contain it until they are pruned');
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('The trash is empty.')).toBeVisible();

  await page.reload();
  const journal = await storedJournal(page);
  const active = journal.journal.entries.filter((item) => item.trashedAt === null).map((item) => item.entry);
  expect(active).toEqual(expect.arrayContaining([expect.objectContaining({ id: kept.id, document: kept.document })]));
  expect(active).toEqual(expect.arrayContaining([expect.objectContaining({ id: free.id, mood: 6, energy: 4 })]));
  expect(journal.journal.entries.some((item) => item.entry.id === occupied.id)).toBe(false);
});

async function setUpBackups(page: Page) {
  await openView(page, 'Settings');
  const section = page.getByRole('region', { name: 'Backups' });
  await section.getByRole('button', { name: 'Choose backup folder…' }).click();
  await expect(section.getByText('Backups will be saved in Synthetic backups.')).toBeVisible();
  await section.getByRole('button', { name: 'Set passphrase…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set a backup passphrase' });
  await expect(dialog).toContainText('Backups can’t be restored without it, on this Mac or any other');
  await expect(dialog.getByRole('checkbox', { name: 'Remember in macOS Keychain' })).not.toBeChecked();
  await dialog.getByLabel('Backup passphrase').fill(PASSPHRASE);
  await dialog.getByLabel('Confirm passphrase').fill(PASSPHRASE);
  await dialog.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(section.getByText('Today’s backup is done.')).toBeVisible();
  return section;
}

test('sets up backups, backs up now and refuses a wrong passphrase without changing the journal', async ({ page }) => {
  const original = entry('2026-11-22', 'morning', 'Fictional morning that must survive a failed restore.');
  await seedJournal(page, { active: [original] });
  await expect(page.getByRole('group', { name: 'Backup status' })).toContainText('Your journal isn’t backed up yet.');

  const section = await setUpBackups(page);
  await expect(page.getByRole('group', { name: 'Backup status' })).toHaveCount(0);
  await section.getByRole('button', { name: 'Back up now' }).click();
  await expect(
    section.getByText(/^Backup complete\. Last successful backup: 22 November 2026 at 10:0\d\.$/),
  ).toBeVisible();
  await expect(section.getByRole('list', { name: 'Backups in this folder' }).getByRole('listitem')).toHaveCount(2);

  await section
    .getByRole('button', { name: /^Restore the backup from/ })
    .first()
    .click();
  const dialog = page.getByRole('alertdialog', { name: 'Restore this backup?' });
  await expect(dialog).toContainText('Restoring replaces the journal on this Mac');
  await dialog.getByLabel('Passphrase for this backup').fill('not-the-right-passphrase');
  await dialog.getByRole('button', { name: 'Replace journal and restore' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The backup was not restored');
  await expect(dialog.getByRole('alert')).toContainText('Your current journal is unchanged.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  const journal = await storedJournal(page);
  expect(journal.journal.entries).toEqual([{ entry: original, trashedAt: null }]);

  await section
    .getByRole('button', { name: /^Restore the backup from/ })
    .first()
    .click();
  await dialog.getByLabel('Passphrase for this backup').fill(PASSPHRASE);
  await dialog.getByRole('button', { name: 'Replace journal and restore' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toContainText(
    'Backup restored: 1 entry in your journal. A safety backup of your previous journal was made first.',
  );
});

test('asks for the passphrase again after a restart unless it was remembered, even in Gentle view', async ({
  page,
}) => {
  const seed: Seed = { folderChosen: true, preferences: { gentle: true } };
  await seedJournal(page, seed);
  const banner = page.getByRole('group', { name: 'Backup status' });
  for (const view of ['Trash', 'Settings', 'Today'] as const) {
    await openView(page, view);
    await expect(banner).toContainText('A backup is due');
    await expect(banner.getByRole('button', { name: /Dismiss|Not now/ })).toHaveCount(0);
  }

  await banner.getByRole('button', { name: 'Enter passphrase' }).click();
  const dialog = page.getByRole('dialog', { name: 'Enter your backup passphrase' });
  await dialog.getByLabel('Backup passphrase').fill(PASSPHRASE);
  await dialog.getByLabel('Confirm passphrase').fill(PASSPHRASE);
  await dialog.getByRole('button', { name: 'Save and back up' }).click();
  await expect(banner).toContainText('Today’s backup is done.');

  await page.reload();
  // The day's backup exists, so nothing is due, but the session passphrase is gone.
  await openView(page, 'Settings');
  await expect(page.getByRole('region', { name: 'Backups' })).toContainText('Not entered in this session.');
});

test('erases all app data after ERASE is typed, keeping backup files', async ({ page }) => {
  await seedJournal(page, {
    active: [entry('2026-11-22', 'evening', 'Fictional entry to erase.')],
    trashed: [{ entry: entry('2026-11-19', 'morning', 'Fictional trashed entry to erase.') }],
    preferences: { theme: 'dark' },
  });
  await setUpBackups(page);
  const erase = page.getByRole('region', { name: 'Erase app data' });
  await expect(erase).toContainText('Backup files in your backup folder are not deleted.');
  await erase.getByRole('button', { name: 'Erase all app data…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Erase all app data?' });
  await dialog.getByLabel('Type ERASE to confirm').fill('erase');
  await dialog.getByRole('button', { name: 'Erase all app data' }).click();
  await expect(dialog).toContainText('Type ERASE in capital letters to confirm.');
  await dialog.getByLabel('Type ERASE to confirm').fill('ERASE');
  await dialog.getByRole('button', { name: 'Erase all app data' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'All app data on this Mac was erased.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  const journal = await storedJournal(page);
  expect(journal.journal.entries).toEqual([]);
  expect(journal.folder).toHaveLength(1);
});

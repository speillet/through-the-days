// Automated accessibility audits (axe-core, WCAG 2.1 A and AA rules) of the main
// views and protection dialogs in light and dark appearance. Automated rules are a
// floor, not proof: VoiceOver and keyboard checks still happen in the native app.

import { entry, expect, expectNoSeriousViolations, openView, seedJournal, test } from './fixtures';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Today, Trash and Settings have no serious accessibility violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await seedJournal(page, {
      active: [entry('2026-11-22', 'morning', 'Fictional morning entry.', { mood: 4, energy: 6 })],
      trashed: [{ entry: entry('2026-11-20', 'evening', 'Fictional entry in the trash.') }],
    });

    await openView(page, 'Today');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, `Today (${colorScheme})`);

    await openView(page, 'Trash');
    await expect(page.getByRole('heading', { level: 2, name: /Friday 20 November 2026/ })).toBeVisible();
    await expectNoSeriousViolations(page, `Trash (${colorScheme})`);
    await page.getByRole('button', { name: /^Delete permanently/ }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expectNoSeriousViolations(page, `Delete permanently dialog (${colorScheme})`);
    await page.keyboard.press('Escape');

    await openView(page, 'Settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expectNoSeriousViolations(page, `Settings (${colorScheme})`);
    await page.getByRole('region', { name: 'Backups' }).getByRole('button', { name: 'Set passphrase…' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousViolations(page, `Passphrase dialog (${colorScheme})`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Erase all app data…' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expectNoSeriousViolations(page, `Erase dialog (${colorScheme})`);
  });
}

test('the manual dark theme has no serious accessibility violations on a light system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await seedJournal(page, { preferences: { theme: 'dark' }, folderChosen: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('group', { name: 'Backup status' })).toBeVisible();
  await expectNoSeriousViolations(page, 'Today with the backup banner (manual dark)');
  await openView(page, 'Settings');
  await expectNoSeriousViolations(page, 'Settings (manual dark)');
});

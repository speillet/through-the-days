// Automated accessibility audits (axe-core, WCAG 2.1 A and AA rules) of the main
// views and protection dialogs in light and dark appearance. Automated rules are a
// floor, not proof: VoiceOver and keyboard checks still happen in the native app.

import { entry, expect, expectNoSeriousViolations, openView, seedJournal, test } from './fixtures';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Accessibility in ${colorScheme} appearance`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await seedJournal(page, {
        active: [entry('2026-11-22', 'morning', 'Fictional morning entry.', { mood: 4, energy: 6 })],
        trashed: [{ entry: entry('2026-11-20', 'evening', 'Fictional entry in the trash.') }],
      });
    });

    test('Today', async ({ page }) => {
      await openView(page, 'Today');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page, 'Today');
    });

    test.describe('Trash', () => {
      test.beforeEach(async ({ page }) => {
        await openView(page, 'Trash');
        await expect(page.getByRole('heading', { level: 2, name: /Friday 20 November 2026/ })).toBeVisible();
      });

      test('trashed entries', async ({ page }) => {
        await expectNoSeriousViolations(page, 'Trash');
      });

      test('permanent deletion dialog', async ({ page }) => {
        await page.getByRole('button', { name: /^Delete permanently/ }).click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await expectNoSeriousViolations(page, 'Delete permanently dialog');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      });
    });

    test.describe('Settings', () => {
      test.beforeEach(async ({ page }) => {
        await openView(page, 'Settings');
        await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      });

      test('settings page', async ({ page }) => {
        await expectNoSeriousViolations(page, 'Settings');
      });

      test('backup passphrase dialog', async ({ page }) => {
        await page.getByRole('region', { name: 'Backups' }).getByRole('button', { name: 'Set passphrase…' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expectNoSeriousViolations(page, 'Passphrase dialog');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      });

      test('erase all app data dialog', async ({ page }) => {
        await page.getByRole('button', { name: 'Erase all app data…' }).click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await expectNoSeriousViolations(page, 'Erase dialog');
      });
    });
  });
}

for (const view of ['Today', 'Settings'] as const) {
  test(`${view} with a manual dark theme on a light system`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedJournal(page, { preferences: { theme: 'dark' }, folderChosen: true });
    await openView(page, view);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('group', { name: 'Backup status' })).toBeVisible();
    await expectNoSeriousViolations(page, `${view} (manual dark)`);
  });
}

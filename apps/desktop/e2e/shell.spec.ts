// The workspace offline, in English on a French system, with appearance choices
// that survive a restart and motion that respects reduced-motion settings.

import { entry, expect, frenchWordIn, openView, seedJournal, test } from './fixtures';

test('opens Today and Settings with the network offline and no account', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await openView(page, 'Settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.getByRole('radio', { name: /Dark/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openView(page, 'Today');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText(/sign in|log in|create an account/i)).toHaveCount(0);
});

test('keeps the interface in English with en-GB dates under a French locale', async ({ page }) => {
  await seedJournal(page, { trashed: [{ entry: entry('2026-11-20', 'evening', 'Fictional entry for the trash.') }] });
  expect(await page.evaluate(() => navigator.language)).toBe('fr-FR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');

  for (const view of ['Today', 'Trash', 'Settings'] as const) {
    await openView(page, view);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(frenchWordIn(text), `French word on ${view}`).toBeNull();
    if (view === 'Trash') {
      await expect(page.getByRole('heading', { level: 2, name: 'Friday 20 November 2026, Evening' })).toBeVisible();
      await expect(page.getByText('Kept until 22 December 2026')).toBeVisible();
    }
    if (view === 'Settings')
      await expect(page.getByText(/Today’s date there is Sunday 22 November 2026/)).toBeVisible();
  }
});

test('restores a manual theme after a restart', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'Settings');
  await page.getByRole('radio', { name: /Dark/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openView(page, 'Settings');
  await expect(page.getByRole('radio', { name: /Dark/ })).toBeChecked();
  await page.getByRole('radio', { name: /Light/ }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('turns off transitions when reduced motion is requested', async ({ page }) => {
  const railTransition = () =>
    page.getByRole('navigation', { name: 'Main' }).evaluate((rail) => getComputedStyle(rail).transitionDuration);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  expect(await railTransition()).not.toBe('0s');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await railTransition()).toBe('0s');

  // The in-app override works even when macOS does not ask for reduced motion.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openView(page, 'Settings');
  await page.getByRole('switch', { name: 'Reduce motion' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  expect(await railTransition()).toBe('0s');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
});

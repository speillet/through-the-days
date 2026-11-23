// The workspace offline, in English on a French system, with appearance choices
// (theme and text size) that survive a restart and motion that respects
// reduced-motion settings.

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

test('enlarges all text, the journal page included, from Settings and the keyboard', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const writing = page.locator('.journal-editor__content').first();
  await expect(writing).toBeVisible();
  const writingSize = () => writing.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  // WebKit reports 130% of 16px as 20.799999px, so sizes are compared as numbers.
  const rootSize = () => html.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const defaultSize = await writingSize();
  expect(await rootSize()).toBe(16);

  await openView(page, 'Settings');
  const textSize = page.getByRole('group', { name: 'Text size' });
  await textSize.getByRole('radio', { name: /Largest/ }).check();
  await expect.poll(rootSize).toBeCloseTo(24, 1);
  await openView(page, 'Today');
  await expect(writing).toBeVisible();
  expect(await writingSize()).toBeCloseTo(defaultSize * 1.5, 1);

  // Command-minus steps down, and the size survives a restart.
  await page.keyboard.press('Meta+Minus');
  await expect.poll(rootSize).toBeCloseTo(20.8, 1);
  await page.reload();
  await expect.poll(rootSize).toBeCloseTo(20.8, 1);
  await expect(writing).toBeVisible();
  expect(await writingSize()).toBeCloseTo(defaultSize * 1.3, 1);

  await page.keyboard.press('Meta+Equal');
  await expect.poll(rootSize).toBeCloseTo(24, 1);
  await page.keyboard.press('Meta+Digit0');
  await expect.poll(rootSize).toBe(16);
  await openView(page, 'Settings');
  await expect(textSize.getByRole('radio', { name: /Default/ })).toBeChecked();
});

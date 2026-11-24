import { entry, expect, openView, seedJournal, test } from './fixtures';

test('a saved edit is consistent across Calendar, Book, search, Trends, Weekly Review and the timeline with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedJournal(page, {
    active: [
      entry('2026-11-22', 'morning', 'Synthetic obsolete morning.', { mood: 2, energy: 3, pride: 9 }),
      entry('2026-11-22', 'evening', 'Synthetic evening writing.', { mood: 7, energy: 6 }),
    ],
    preferences: { reduceMotion: true },
  });
  await openView(page, 'Weekly Review');
  await page.getByRole('textbox', { name: 'Your notes' }).fill('Synthetic authored weekly notes.');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Recalculate local summary' }).click();
  await expect(page.getByLabel('Optional local summary')).toContainText('1 recorded day out of 7');
  await openView(page, 'Calendar');
  const morning = page.getByRole('region', { name: 'Morning entry from 22 November 2026' });
  await morning.getByRole('button', { name: 'Edit Morning entry from 22 November 2026' }).click();
  await page.getByRole('group', { name: 'How is my energy?' }).getByRole('radio', { name: /^9,/ }).check();
  const editor = page.getByRole('textbox', { name: /Morning journal/ });
  await editor.fill('Synthetic revised morning.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('status').filter({ hasText: /^(Saving…|Saved|Couldn't save)$/ })).toHaveText(
    'Saved',
  );
  await openView(page, 'Calendar');
  await expect(morning).toContainText('Synthetic revised morning.');
  await expect(morning).toContainText('Energy 9/10');
  await morning.getByRole('button', { name: 'Read Morning in Book View' }).click();
  const article = page.getByRole('article', { name: 'Morning journal entry' });
  await expect(article).toContainText('Synthetic revised morning.');
  await expect(article).toContainText('Energy 9/10');
  const bookPage = page.getByLabel('Scrollable journal page', { exact: true });
  expect(await bookPage.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  expect(await bookPage.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await bookPage.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('article', { name: 'Evening journal entry' })).toContainText('Energy 6/10');
  await bookPage.hover();
  await page.mouse.wheel(-120, 0);
  await expect(article).toContainText('Energy 9/10');
  await page.mouse.wheel(0, 120);
  await expect(article).toContainText('Synthetic revised morning.');
  await openView(page, 'My Journal');
  await page.getByRole('searchbox', { name: 'Search journal' }).fill('obsolete');
  await expect(page.getByText('No entries match these filters.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search journal' }).fill('revised');
  await expect(page.getByText('Synthetic revised morning.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search journal' }).fill('');
  await openView(page, 'Trends');
  await expect(page.getByText('Mean 7.5/10, n=2', { exact: true })).toBeVisible();
  await expect(page.getByText('Mean 4.5/10, n=2', { exact: true })).toBeVisible();
  await expect(page.getByText(/1 recorded day of 14; 2 saved entries/)).toBeVisible();
  await openView(page, 'Weekly Review');
  await expect(page.getByText('Mean 7.5/10, n=2', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your notes' })).toHaveValue(
    'Synthetic authored weekly notes.',
  );
  await expect(
    page.getByText('Sources changed. The old summary is hidden; recalculate to use current records.'),
  ).toBeVisible();
  await openView(page, 'The Path So Far');
  const source = page.getByRole('region', { name: 'Morning entry from 22 November 2026' });
  await expect(source).toContainText('Energy 9/10');
  await expect(source).toContainText('Synthetic revised morning.');
});

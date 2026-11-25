import { entry, expect, expectNoSeriousViolations, openView, seedJournal, test } from './fixtures';

test('Book View keeps every passage, selection and scroll position across resize and return', async ({
  page,
}) => {
  const morning = entry('2026-11-22', 'morning', 'Synthetic long journal.', { mood: 2, energy: 3 });
  morning.document = {
    type: 'doc',
    content: Array.from({ length: 200 }, (_, index) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Synthetic long passage ${index + 1}.` }],
    })),
  };
  await seedJournal(page, {
    active: [morning, entry('2026-11-22', 'evening', 'Synthetic evening writing.')],
  });
  await openView(page, 'Calendar');
  await page.getByRole('button', { name: 'Read Morning in Book View' }).click();
  const article = page.getByRole('article', { name: 'Morning journal entry' });
  await expect(article.getByText('Synthetic long passage 200.', { exact: true })).toHaveCount(1);
  await article.getByText('Synthetic long passage 1.', { exact: true }).selectText();
  await page.setViewportSize({ width: 820, height: 700 });
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Synthetic long passage 1.');
  const sheet = page.getByLabel('Scrollable journal page', { exact: true });
  await sheet.evaluate((element) => {
    element.scrollTop = 1100;
  });
  await expect.poll(() => sheet.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Return to Calendar' }).click();
  await page.getByRole('button', { name: 'Read Morning in Book View' }).click();
  await expect.poll(() => sheet.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await sheet.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('article', { name: 'Evening journal entry' })).toContainText(
    'Synthetic evening writing.',
  );
});

test('weekly notes survive restart and excluding a source immediately hides its generated summary', async ({
  page,
}) => {
  await seedJournal(page, {
    active: [entry('2026-11-22', 'morning', 'Synthetic private source.', { mood: 2, energy: 3 })],
  });
  await openView(page, 'Weekly Review');
  await page.getByRole('textbox', { name: 'Your notes' }).fill('Synthetic authored weekly notes.');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Recalculate local summary' }).click();
  await expect(page.getByLabel('Optional local summary')).toContainText('1 recorded day out of 7');
  await page.getByLabel('Include in insights and timelines').click();
  await expect(
    page.getByText('Sources changed. The old summary is hidden; recalculate to use current records.'),
  ).toBeVisible();
  await expect(page.getByLabel('Optional local summary')).not.toContainText('1 recorded day out of 7');
  await page.reload();
  await openView(page, 'Weekly Review');
  await expect(page.getByRole('textbox', { name: 'Your notes' })).toHaveValue(
    'Synthetic authored weekly notes.',
  );
  await expect(page.getByText('Synthetic private source.', { exact: true })).toHaveCount(0);
  await openView(page, 'Calendar');
  await expect(page.getByText('Synthetic private source.', { exact: true })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const view of ['Calendar', 'My Journal', 'Book View', 'Trends', 'Weekly Review', 'The Path So Far'] as const) {
    test(`${view} has no serious accessibility violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await seedJournal(page, {
        active: [entry('2026-11-22', 'morning', 'Synthetic accessible writing.', { mood: 5, energy: 3 })],
      });
      await openView(page, view);
      await expect(page.getByRole('heading', { level: 1, name: view })).toBeVisible();
      await expect(page.getByText(/Opening (saved|recorded|your|this)/)).toHaveCount(0);
      await expectNoSeriousViolations(page, `${view} (${colorScheme})`);
    });
  }
}

test('historical timelines keep both slots, gaps, hidden-series preferences and keyboard source navigation', async ({
  page,
}) => {
  await seedJournal(page, {
    active: [
      entry('2026-11-20', 'morning', 'Synthetic historical morning.', { mood: 2, energy: 3 }),
      entry('2026-11-20', 'evening', 'Synthetic historical evening.', { mood: 7, energy: 6 }),
    ],
  });
  await openView(page, 'Trends');
  await page.getByLabel('Ending on').fill('2026-11-20');
  const timeline = page.getByRole('list', { name: 'Recorded days and gaps' });
  await expect(timeline.getByRole('listitem')).toHaveCount(14);
  await expect(timeline.locator('time').first()).toHaveAttribute('datetime', '2026-11-07');
  await expect(timeline.getByText('Mood 2/10', { exact: true })).toBeVisible();
  await expect(timeline.getByText('Mood 7/10', { exact: true })).toBeVisible();
  await expect(timeline.getByText('No entry', { exact: true })).toHaveCount(13);
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(timeline.getByRole('listitem')).toHaveCount(7);
  await page.getByRole('button', { name: '30 days', exact: true }).click();
  await expect(timeline.getByRole('listitem')).toHaveCount(30);
  await expect(timeline.locator('time').first()).toHaveAttribute('datetime', '2026-10-22');
  for (const name of ['Mood', 'Energy', 'Pride', 'Perceived progress'])
    await page.getByRole('checkbox', { name, exact: true }).uncheck();
  await page.reload();
  await openView(page, 'Trends');
  await page.getByLabel('Ending on').fill('2026-11-20');
  for (const name of ['Mood', 'Energy', 'Pride', 'Perceived progress'])
    await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  await expect(timeline.getByRole('listitem')).toHaveCount(30);
  await expect(timeline.getByText('Mood 2/10', { exact: true })).toHaveCount(0);
  const sourceDay = timeline.getByRole('listitem').last().getByRole('button');
  await sourceDay.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Friday 20 November 2026');
  await expect(page.getByRole('textbox', { name: /Morning journal/ })).toContainText(
    'Synthetic historical morning.',
  );
});

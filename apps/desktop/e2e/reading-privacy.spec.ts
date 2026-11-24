import { entry, expect, openView, seedJournal, test } from './fixtures';

test('Gentle view suspends score filters on every reading surface and preserves notes, original wins and backup prompts', async ({
  page,
}) => {
  const morning = entry('2026-11-22', 'morning', 'Synthetic gentle morning.', { mood: 2, energy: 3 });
  morning.wins = [
    { id: crypto.randomUUID(), text: 'Synthetic excluded win.', origin: 'manual', includeInInsights: false },
  ];
  await seedJournal(page, {
    active: [morning, entry('2026-11-22', 'evening', 'Synthetic gentle evening.', { mood: 8, energy: 6 })],
    folderChosen: true,
  });
  await openView(page, 'My Journal');
  await page.getByText('More filters', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Measure', exact: true }).selectOption('mood');
  await page.getByLabel('Minimum score', { exact: true }).fill('8');
  await expect(page.getByText('Synthetic gentle morning.', { exact: true })).toHaveCount(0);
  await openView(page, 'Settings');
  await page.getByRole('switch', { name: 'Gentle view' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'Gentle view' })).toBeChecked();
  await openView(page, 'My Journal');
  await expect(page.getByText('Synthetic gentle morning.', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Measure', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Minimum score', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/2 saved entries/)).toHaveCount(0);
  await openView(page, 'Trends');
  await expect(page.getByText(/Gentle view keeps recorded dates/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Mood', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Mean \d/)).toHaveCount(0);
  await openView(page, 'Weekly Review');
  await expect(page.getByLabel('Optional local summary')).toHaveCount(0);
  await expect(page.getByText('Synthetic excluded win.', { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Your notes' }).fill('Synthetic gentle weekly reflection.');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  await openView(page, 'The Path So Far');
  await expect(page.getByText('Synthetic gentle morning.', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic excluded win.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Mood 2/10', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Read Morning in Book View' }).click();
  await page.getByText('Read check-in answers', { exact: true }).click();
  await expect(page.getByText('Synthetic excluded win.', { exact: true })).toBeVisible();
  await expect(page.getByText('Mood 2/10', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Backup status' })).toBeVisible();
  await openView(page, 'Settings');
  await page.getByRole('switch', { name: 'Gentle view' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'Gentle view' })).not.toBeChecked();
  await openView(page, 'My Journal');
  await page.getByText('More filters', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Measure', exact: true })).toHaveValue('mood');
  await expect(page.getByLabel('Minimum score', { exact: true })).toHaveValue('8');
  await expect(page.getByText('Synthetic gentle morning.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic gentle evening.', { exact: true })).toBeVisible();
  await openView(page, 'Weekly Review');
  await expect(page.getByRole('textbox', { name: 'Your notes' })).toHaveValue(
    'Synthetic gentle weekly reflection.',
  );
});

test('insight permissions apply to source cards, win filters, denominators and every delivered layer', async ({
  page,
}) => {
  const privateWin = entry('2026-11-22', 'morning', 'Synthetic source with an excluded win.', { mood: 8 });
  privateWin.wins = [
    { id: crypto.randomUUID(), text: 'Synthetic excluded win.', origin: 'manual', includeInInsights: false },
  ];
  const included = entry('2026-11-22', 'evening', 'Synthetic included source.', { mood: 2 });
  included.wins = [
    { id: crypto.randomUUID(), text: 'Synthetic included win.', origin: 'manual', includeInInsights: true },
  ];
  const excluded = entry('2026-11-21', 'morning', 'Synthetic source excluded from insights.', {
    mood: 10,
    includeInInsights: false,
  });
  await seedJournal(page, { active: [privateWin, included, excluded] });
  await openView(page, 'The Path So Far');
  await page.getByText('More filters', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Small wins', exact: true }).selectOption('true');
  await expect(page.getByText('Synthetic included source.', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic source with an excluded win.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic source excluded from insights.', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Small wins', exact: true }).selectOption('false');
  await expect(page.getByText('Synthetic source with an excluded win.', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic included source.', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Small wins', exact: true }).selectOption('true');
  await openView(page, 'Trends');
  await expect(page.getByText('Mean 2/10, n=1', { exact: true })).toBeVisible();
  await openView(page, 'Weekly Review');
  await expect(page.getByText('Synthetic excluded win.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic source excluded from insights.', { exact: true })).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Evening entry from 22 November 2026' })
    .getByLabel('Include in insights and timelines')
    .click();
  await expect(page.getByText('Synthetic included source.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Mean 8/10, n=1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Read Morning in Book View' }).click();
  await expect(page.getByRole('article', { name: 'Morning journal entry' })).toContainText(
    'Synthetic source with an excluded win.',
  );
  await expect(page.getByRole('button', { name: 'Previous entry' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next entry' })).toBeDisabled();
  await page.getByRole('button', { name: 'Return to Weekly Review' }).click();
  await openView(page, 'The Path So Far');
  await expect(page.getByText('Synthetic included source.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic source with an excluded win.', { exact: true })).toHaveCount(0);
  await openView(page, 'Trends');
  await expect(page.getByText(/0 recorded days of 14; 0 saved entries/)).toBeVisible();
  await openView(page, 'Calendar');
  await expect(page.getByText('Synthetic included source.', { exact: true })).toBeVisible();
});

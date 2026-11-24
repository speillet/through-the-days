import { entry, expect, openView, seedJournal, test } from './fixtures';

test('the timeline preserves filters, layers, source slots and custom ranges through keyboard navigation and Book return', async ({
  page,
}) => {
  await seedJournal(page, {
    active: [
      entry('2026-10-01', 'morning', 'Synthetic scoped older writing.'),
      entry('2026-11-20', 'morning', 'Synthetic scoped morning.', { mood: 2, energy: 3 }),
      entry('2026-11-20', 'evening', 'Synthetic scoped evening.', { mood: 7, energy: 6 }),
    ],
  });
  await openView(page, 'The Path So Far');
  await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add milestone' });
  await dialog.getByLabel('Date', { exact: true }).fill('2026-11-21');
  await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('Synthetic scoped milestone');
  await dialog.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic scoped milestone' })).toBeVisible();
  await page.getByRole('button', { name: 'Custom range' }).click();
  await page.getByLabel('From', { exact: true }).fill('2026-11-01');
  await page.getByLabel('To', { exact: true }).fill('2026-11-22');
  await page.getByRole('button', { name: 'Zoom out' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '30 days', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Zoom in' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '7 days', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Earlier range' }).click();
  await expect(
    page.getByText(
      'No records in the selected layers from Monday 9 November 2026 to Sunday 15 November 2026.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'End today' }).click();
  await page.getByRole('searchbox', { name: 'Search journal' }).fill('scoped');
  await page.getByRole('checkbox', { name: 'Private milestones' }).uncheck();
  await expect(page.getByRole('heading', { name: 'Synthetic scoped milestone' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Read Morning in Book View' }).click();
  await expect(page.getByText('Entry 1 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next entry' }).click();
  await expect(page.getByRole('article', { name: 'Evening journal entry' })).toContainText(
    'Synthetic scoped evening.',
  );
  await page.getByRole('button', { name: 'Return to The Path So Far' }).click();
  await expect(page.getByRole('button', { name: '7 days', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('checkbox', { name: 'Private milestones' })).not.toBeChecked();
  await expect(page.getByRole('searchbox', { name: 'Search journal' })).toHaveValue('scoped');
  await openView(page, 'My Journal');
  await page.getByText('More filters', { exact: true }).click();
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('');
  await expect(page.getByText('Synthetic scoped older writing.', { exact: true })).toBeVisible();
  await openView(page, 'The Path So Far');
  await page.getByRole('button', { name: '90 days', exact: true }).click();
  await expect(page.getByText('Synthetic scoped older writing.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1 year', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
});

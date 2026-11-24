// Writing on Today: keyboard-only writing with exact recovery after a restart,
// skipping every check-in stage, independent Morning and Evening observations,
// Gentle view, and meaning carried by text rather than colour.

import type { Page } from '@playwright/test';
import type { Entry } from '../src/api/types';
import { documentText } from '../src/domain/entry';
import { expect, openView, seedJournal, storedJournal, tabTo, test } from './fixtures';

const TODAY = '2026-11-22';

function journalPage(page: Page, slot: 'Morning' | 'Evening' = 'Morning') {
  return page.getByRole('textbox', { name: new RegExp(`^${slot} journal, Sunday 22 November 2026`) });
}

function saveStatus(page: Page) {
  return page.getByRole('status').filter({ hasText: /^(Saving…|Saved|Couldn't save)$/ });
}

function checkIn(page: Page) {
  return page.getByRole('region', { name: 'Check-in' });
}

async function savedEntries(page: Page): Promise<Entry[]> {
  const journal = await storedJournal(page);
  return journal.journal.entries.filter((item) => item.trashedAt === null).map((item) => item.entry);
}

/** Chooses a score with the keyboard; the visible number is decoration for the radio. */
async function chooseScore(page: Page, scale: string, option: RegExp) {
  const radio = page.getByRole('group', { name: scale }).getByRole('radio', { name: option });
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(radio).toBeChecked();
}

test('writes with the keyboard alone and recovers the exact text after a restart', async ({ page }) => {
  // Deliberate multilingual synthetic fixture: French words with accents and an emoji.
  const words = 'Fixture fictive : une journée paisible au bord du canal, café crème et pluie fine 🌿 — à bientôt !';
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  const todayInRail = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' });
  await tabTo(page, todayInRail);
  expect(await todayInRail.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');

  const writeDirectly = checkIn(page).getByRole('button', { name: 'Write directly' });
  await tabTo(page, writeDirectly);
  expect(await writeDirectly.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(journalPage(page)).toBeFocused();

  await page.keyboard.type(words);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveText('Saved');

  await page.reload();
  await expect(journalPage(page)).toHaveText(words);
  const [saved] = await savedEntries(page);
  expect(documentText(saved.document)).toBe(words);
  expect(saved).toMatchObject({ date: TODAY, slot: 'morning', mood: null, energy: null, complete: false });
});

test('skips every check-in stage and writes straight away, inventing no answers', async ({ page }) => {
  await page.goto('/');
  const region = checkIn(page);
  await expect(region).toBeVisible();
  for (let stage = 0; stage < 10 && (await region.getByRole('button', { name: 'Skip' }).count()) > 0; stage += 1) {
    await region.getByRole('button', { name: 'Skip' }).click();
  }
  await expect(region.getByRole('heading', { name: 'Check-in finished' })).toBeVisible();
  await region.getByRole('button', { name: 'Start writing' }).click();
  await expect(journalPage(page)).toBeFocused();

  await page.keyboard.type('Fictional words written after skipping the check-in.');
  await expect(saveStatus(page)).toHaveText('Saved', { timeout: 10_000 });
  const [saved] = await savedEntries(page);
  expect(saved).toMatchObject({
    mood: null,
    energy: null,
    pride: null,
    progress: null,
    emotion: '',
    anotherEmotion: '',
    actions: [],
    wins: [],
    reflection: { intention: '', proudOf: '', difficulty: '', nextStep: '', helped: '', learned: '' },
  });
});

test('keeps Morning 2/3 and Evening 7/6 independent after a restart', async ({ page }) => {
  await page.goto('/');
  await chooseScore(page, 'Mood', /^2,/);
  await chooseScore(page, 'How is my energy?', /^3,/);
  await expect(saveStatus(page)).toHaveText('Saved', { timeout: 10_000 });

  await page.getByRole('tab', { name: /^Evening/ }).click();
  await chooseScore(page, 'Mood', /^7,/);
  await chooseScore(page, 'How is my energy?', /^6,/);
  await expect(saveStatus(page)).toHaveText('Saved', { timeout: 10_000 });

  await page.reload();
  await expect(page.getByRole('group', { name: 'Mood' }).getByRole('radio', { name: /^2,/ })).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'How is my energy?' }).getByRole('radio', { name: /^3,/ }),
  ).toBeChecked();
  await page.getByRole('tab', { name: /^Evening/ }).click();
  await expect(page.getByRole('group', { name: 'Mood' }).getByRole('radio', { name: /^7,/ })).toBeChecked();
  await expect(
    page.getByRole('group', { name: 'How is my energy?' }).getByRole('radio', { name: /^6,/ }),
  ).toBeChecked();

  const entries = await savedEntries(page);
  expect(
    entries
      .map(({ slot, mood, energy, date }) => ({ slot, mood, energy, date }))
      .sort((a, b) => a.slot.localeCompare(b.slot)),
  ).toEqual([
    { slot: 'evening', mood: 7, energy: 6, date: TODAY },
    { slot: 'morning', mood: 2, energy: 3, date: TODAY },
  ]);
});

test('Gentle view hides score scales but keeps small wins, writing and the backup banner', async ({ page }) => {
  await seedJournal(page, { preferences: { gentle: true } });
  await expect(page.getByRole('group', { name: 'Backup status' })).toContainText('Set up backups');
  await expect(checkIn(page)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Mood' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'How is my energy?' })).toHaveCount(0);
  await expect(page.getByText(/About 30 seconds|About 5–10 minutes/)).toHaveCount(0);

  await checkIn(page).getByRole('button', { name: 'Small wins and pride' }).click();
  await expect(page.getByRole('group', { name: 'What did I manage to do, even if it felt small?' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'How proud do I feel?' })).toHaveCount(0);
  await page.getByLabel('Add a small win').fill('Fictional win: watered the plants.');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(saveStatus(page)).toHaveText('Saved', { timeout: 10_000 });
  await expect(journalPage(page)).toBeVisible();

  await openView(page, 'Settings');
  const gentle = page.getByRole('switch', { name: 'Gentle view' });
  await gentle.focus();
  await page.keyboard.press('Space');
  await expect(gentle).not.toBeChecked();
  await openView(page, 'Today');
  await expect(page.getByRole('group', { name: 'Mood' })).toBeVisible();
  const [saved] = await savedEntries(page);
  expect(saved.wins).toEqual([
    expect.objectContaining({ text: 'Fictional win: watered the plants.', origin: 'manual' }),
  ]);
});

test('carries score and emotion meaning in words, not colour alone', async ({ page }) => {
  await page.goto('/');
  const mood = page.getByRole('group', { name: 'Mood' });
  await expect(mood.getByRole('radio')).toHaveCount(11);
  const names = await mood
    .getByRole('radio')
    .evaluateAll((radios) => radios.map((radio) => radio.getAttribute('aria-label')));
  expect(names).toEqual([
    '0, very unpleasant',
    '1, unpleasant',
    '2, unpleasant',
    '3, unpleasant',
    '4, unpleasant',
    '5, neutral',
    '6, pleasant',
    '7, pleasant',
    '8, pleasant',
    '9, pleasant',
    '10, very pleasant',
  ]);
  await chooseScore(page, 'Mood', /^5,/);
  await expect(mood).toContainText('Selected: 5, neutral');

  const families = [
    'Unpleasant, higher energy',
    'Pleasant, higher energy',
    'Unpleasant, lower energy',
    'Pleasant, lower energy',
  ];
  for (const family of families) {
    const group = page.getByRole('group', { name: family, exact: true });
    await expect(group).toBeVisible();
    const chips = group.getByRole('radio');
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
    // Each word is named in text (its English label first), so no chip relies on its family colour.
    for (let index = 0; index < count; index += 1) {
      await expect(chips.nth(index)).toHaveAccessibleName(/^[A-Z][a-z]+(?:-[a-z]+)?\b/);
    }
  }
  const anxious = page.getByRole('radio', { name: /^Anxious/ });
  await anxious.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('Chosen:')).toContainText('Anxious');
});

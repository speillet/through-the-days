// The smallest window the app allows (720 × 560 points, tauri.conf.json): the rail's
// Trash and Settings stay in view and clickable, no view scrolls sideways, and the
// automated accessibility rules still pass, also with the largest text size.

import type { Page } from '@playwright/test';
import {
  entry,
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousViolations,
  openView,
  seedJournal,
  test,
} from './fixtures';

test.use({ viewport: { width: 720, height: 560 } });

function railButton(page: Page, name: 'Today' | 'Trash' | 'Settings') {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
}

/** Fully inside the window and the topmost element where a click would land. */
async function expectReachable(page: Page, name: 'Trash' | 'Settings') {
  await expect(railButton(page, name)).toBeInViewport({ ratio: 1 });
  await railButton(page, name).click({ trial: true, timeout: 2_000 });
}

for (const view of ['Today', 'Trash', 'Settings'] as const) {
  test(`keeps ${view} accessible and the rail reachable at the minimum size`, async ({ page }) => {
    await seedJournal(page, {
      active: [entry('2026-11-22', 'morning', 'Fictional morning in a small window.', { mood: 5, energy: 4 })],
      trashed: [{ entry: entry('2026-11-20', 'evening', 'Fictional entry in the trash.') }],
    });
    await expect(page.getByRole('list', { name: 'Coming later' })).toBeVisible();
    await expectReachable(page, 'Trash');
    await expectReachable(page, 'Settings');

    await railButton(page, view).click();
    await expect(railButton(page, view)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, view);
    await expectReachable(page, 'Trash');
    await expectReachable(page, 'Settings');
    await expectNoSeriousViolations(page, `${view} at 720 × 560`);
  });
}

test('keeps the rail and Settings usable with the largest text size at the minimum size', async ({ page }) => {
  await seedJournal(page, { preferences: { textScale: 150 } });
  await expect(page.locator('html')).toHaveCSS('font-size', '24px');
  await expectReachable(page, 'Trash');
  await expectReachable(page, 'Settings');
  for (const view of ['Today', 'Settings'] as const) {
    await openView(page, view);
    await expectNoHorizontalOverflow(page, `${view} with the largest text`);
  }
  await expectNoSeriousViolations(page, 'Settings with the largest text at 720 × 560');
});

test('opens every view from a collapsed rail at the minimum size', async ({ page }) => {
  await seedJournal(page, { preferences: { sidebarOpen: false } });
  for (const view of ['Trash', 'Settings', 'Today'] as const) {
    await expect(railButton(page, view)).toBeInViewport({ ratio: 1 });
    await railButton(page, view).click();
    await expect(railButton(page, view)).toHaveAttribute('aria-current', 'page');
    await expectNoHorizontalOverflow(page, `${view} with the rail collapsed`);
  }
});

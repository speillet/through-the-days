// Shared end-to-end fixtures: a fixed starting time, a guard that blocks and fails
// any request leaving this machine, and helpers that seed the browser preview's
// synthetic journal. Every record here is fictional.

import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { Entry, Preferences, Slot } from '../src/api/types';

/** Sunday 22 November 2026, 10:00 in Paris. Time then runs normally. */
export const TEST_NOW = new Date('2026-11-22T09:00:00Z');
export const TEST_NOW_SECONDS = Math.floor(TEST_NOW.getTime() / 1000);

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const test = base.extend<{ remoteRequests: string[] }>({
  // Automatic: every test fails if the page tried to reach another host.
  remoteRequests: [
    async ({ context }, use) => {
      const blocked: string[] = [];
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (LOCAL_HOSTS.has(url.hostname)) {
          await route.continue();
        } else {
          blocked.push(`${url.protocol}//${url.host}`);
          await route.abort('blockedbyclient');
        }
      });
      await use(blocked);
      expect(blocked, 'requests to hosts other than this machine').toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    await page.clock.install({ time: TEST_NOW });
    await use(page);
  },
});

export { expect };

// ---------------------------------------------------------------------------
// The browser preview keeps its synthetic journal in Web Storage (src/api/memory.ts).

const STORAGE_KEY = 'ttd-preview-v1';

export const DEFAULT_PREFERENCES: Preferences = {
  timeZone: 'Europe/Paris',
  theme: 'system',
  gentle: false,
  showDurations: true,
  showToolbar: true,
  showScores: true,
  sidebarOpen: true,
  reduceMotion: false,
  defaultDepth: 'daily',
  showWordCount: false,
};

export function documentOf(text: string): Entry['document'] {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

/** A saved synthetic entry (revision 1) for a journal date and slot. */
export function entry(date: string, slot: Slot, text: string, changes: Partial<Entry> = {}): Entry {
  return {
    id: crypto.randomUUID(),
    date,
    slot,
    document: documentOf(text),
    revision: 1,
    mood: null,
    energy: null,
    complete: false,
    title: '',
    pride: null,
    progress: null,
    emotion: '',
    anotherEmotion: '',
    depth: 'daily',
    reflection: { intention: '', proudOf: '', difficulty: '', nextStep: '', helped: '', learned: '' },
    actions: [],
    wins: [],
    createdTimeZone: 'Europe/Paris',
    ...changes,
  };
}

export interface Seed {
  active?: Entry[];
  /** Entries in the trash, deleted at the test's starting time unless given. */
  trashed?: { entry: Entry; deletedAt?: number }[];
  preferences?: Partial<Preferences>;
  /** A backup folder is already chosen; the passphrase is never stored. */
  folderChosen?: boolean;
}

/** Replaces the preview journal with a synthetic one and reloads the app. */
export async function seedJournal(page: Page, seed: Seed): Promise<void> {
  await page.goto('/');
  const state = {
    version: 1,
    journal: {
      entries: [
        ...(seed.active ?? []).map((item) => ({ entry: item, trashedAt: null })),
        ...(seed.trashed ?? []).map((item) => ({ entry: item.entry, trashedAt: item.deletedAt ?? TEST_NOW_SECONDS })),
      ],
      preferences: { ...DEFAULT_PREFERENCES, ...seed.preferences },
    },
    plan: {
      folderChosen: seed.folderChosen ?? false,
      lastSuccessDate: null,
      lastSuccessAt: null,
      retentionWarning: false,
      rememberedFingerprint: null,
    },
    folder: [],
  };
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(state)]);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

interface StoredJournal {
  journal: { entries: { entry: Entry; trashedAt: number | null }[]; preferences: Preferences };
  folder: { name: string }[];
}

/** Reads the preview journal back, to check what was persisted. */
export async function storedJournal(page: Page): Promise<StoredJournal> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('The preview journal has not been saved yet.');
  return JSON.parse(raw) as StoredJournal;
}

/** Opens a view from the navigation rail. */
export async function openView(page: Page, name: 'Today' | 'Trash' | 'Settings'): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true }).click();
}

/** Presses Tab until the locator has focus, as a keyboard-only person would. */
export async function tabTo(page: Page, target: Locator, maxPresses = 40): Promise<void> {
  for (let press = 0; press < maxPresses; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** The French-word check shared with the unit guards (src/guards/sources.ts). */
export { frenchWordIn } from '../src/guards/sources';

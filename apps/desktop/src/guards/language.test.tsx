// Guard: first-party copy stays English (en-GB) whatever the Mac's language, while
// the person's own words are never translated (product-guardrails, desktop-shell).

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createMemoryApi, createMemoryStorage, type MemoryApiOptions } from '../api/memory';
import { newDraft } from '../domain/entry';
import { TEST_NOW } from '../test/render';
import {
  APP_ROOT,
  displayPath,
  firstPartySources,
  frenchWordIn,
  NON_ENGLISH_LETTER,
  read,
  segments,
  withoutComments,
} from './sources';

/** Visible text plus the names and hints that only assistive technology reads. */
function interfaceText(): string {
  const attributes = Array.from(
    document.querySelectorAll('[aria-label],[title],[placeholder],[alt],[aria-description]'),
  )
    .flatMap((element) =>
      ['aria-label', 'title', 'placeholder', 'alt', 'aria-description'].map((name) => element.getAttribute(name)),
    )
    .filter((value): value is string => Boolean(value));
  return [document.body.textContent ?? '', ...attributes].join('\n');
}

function expectEnglish(where: string) {
  const text = interfaceText();
  expect(frenchWordIn(text), `${where}: French word in the interface`).toBeNull();
  expect(text.match(NON_ENGLISH_LETTER)?.[0] ?? null, `${where}: non-English letter in the interface`).toBeNull();
}

/** A Mac set to French: only the language changes, the rest of navigator stays real. */
function frenchMac() {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'fr']);
}

async function openApp(options: MemoryApiOptions = {}) {
  const api = createMemoryApi({ storage: createMemoryStorage(), now: () => TEST_NOW, ...options });
  render(<App api={api} />);
  return api;
}

describe('English first-party source', () => {
  it('keeps every first-party source free of non-English letters', () => {
    const problems: string[] = [];
    for (const path of firstPartySources()) {
      for (const segment of segments(read(path))) {
        const letter = segment.text.match(NON_ENGLISH_LETTER)?.[0];
        if (letter) problems.push(`${displayPath(path)}:${segment.line} contains “${letter}”`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('uses no French words in first-party strings or interface text', () => {
    const problems: string[] = [];
    for (const path of firstPartySources()) {
      for (const segment of withoutComments(read(path))) {
        if (segment.kind === 'regex') continue;
        const word = frenchWordIn(segment.text);
        if (word) problems.push(`${displayPath(path)}:${segment.line} contains “${word}”`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('declares the page language as British English', () => {
    expect(read(join(APP_ROOT, 'index.html'))).toMatch(/<html lang="en-GB">/);
  });
});

describe('English interface on a French Mac', () => {
  it('renders Today, Trash and Settings in English with en-GB dates', async () => {
    frenchMac();
    expect(navigator.language).toBe('fr-FR');
    const user = userEvent.setup();
    const api = await openApp();
    const deleted = await api.saveEntry(newDraft('2026-11-20', 'morning', 'Europe/Paris'));
    await api.trashEntry(deleted.id, deleted.revision);

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    await screen.findByRole('heading', { level: 1 });
    expectEnglish('Today');

    await user.click(within(nav).getByRole('button', { name: 'Trash' }));
    await screen.findByRole('heading', { level: 2, name: /Friday 20 November 2026/ });
    expectEnglish('Trash');
    await user.click(screen.getByRole('button', { name: /^Delete permanently/ }));
    expectEnglish('Delete permanently dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(within(nav).getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText(/Today’s date there is Sunday 22 November 2026/)).toBeInTheDocument();
    expectEnglish('Settings');
    await user.click(screen.getByRole('button', { name: 'Set passphrase…' }));
    expectEnglish('Passphrase dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
    expectEnglish('Erase dialog');
  });

  it('renders every startup state in English', async () => {
    frenchMac();
    for (const state of ['needsMigration', 'unsupported', 'failed'] as const) {
      const { unmount } = render(
        <App api={createMemoryApi({ storage: createMemoryStorage(), now: () => TEST_NOW, startup: { state } })} />,
      );
      await screen.findByRole('heading', { level: 1 });
      expectEnglish(`Startup: ${state}`);
      unmount();
    }
  });
});

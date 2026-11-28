// Guard: every control stays reachable with Tab in the macOS webview
// (desktop-shell: keyboard writing). WebKit leaves buttons, links, checkboxes and
// pop-up or list controls out of the Tab order unless macOS keyboard navigation is
// switched on, or the control has an explicit tabindex="0" (components/keyboard.ts).
// Linux WebKit and Chromium tab to every control, so only this guard catches a
// control that lost its explicit tab stop. Native radio groups and the roving
// widgets (tabs, toolbars, grids) keep exactly one tab stop each.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import type { MemoryApiOptions } from '../api/memory';
import { newDraft } from '../domain/entry';
import { createTestApi } from '../test/render';

const CONTROLS = 'button, a[href], input[type="checkbox"], select, summary';
const ROVING = '[role="tablist"], [role="toolbar"], [role="grid"]';
const PASSPHRASE = 'fictional-keyboard-harbour';

function describeControl(element: Element): string {
  const name = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
  return `<${element.tagName.toLowerCase()}> “${name.slice(0, 40)}” has tabindex ${element.getAttribute('tabindex') ?? 'unset'}`;
}

/** Controls that a keyboard-only person could not reach with Tab in the macOS webview. */
function tabStopProblems(where: string): string[] {
  const enabled = (element: Element) => !(element as HTMLButtonElement).disabled;
  const problems: string[] = [];
  for (const element of Array.from(document.querySelectorAll(CONTROLS)).filter(enabled)) {
    if (element.closest(ROVING)) continue;
    if (element.getAttribute('tabindex') !== '0') problems.push(`${where}: ${describeControl(element)}`);
  }
  for (const widget of Array.from(document.querySelectorAll(ROVING))) {
    const stops = Array.from(widget.querySelectorAll(CONTROLS))
      .filter(enabled)
      .filter((element) => element.getAttribute('tabindex') === '0');
    if (stops.length !== 1) {
      problems.push(`${where}: ${widget.getAttribute('role')} “${widget.getAttribute('aria-label') ?? ''}” has ${stops.length} tab stops`);
    }
  }
  return problems;
}

async function openApp(options: MemoryApiOptions = {}) {
  const api = createTestApi(options);
  render(<App api={api} />);
  return api;
}

describe('explicit tab stops', () => {
  it('keeps every control on Today, Trash, Settings and their dialogs in the Tab order', async () => {
    const user = userEvent.setup();
    const api = await openApp();
    const trashed = await api.saveEntry(newDraft('2026-11-20', 'evening', 'Europe/Paris'));
    await api.trashEntry(trashed.id, trashed.revision);
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    await api.backupNow();
    const problems: string[] = [];

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    await screen.findByRole('heading', { level: 1 });
    problems.push(...tabStopProblems('Today'));

    await user.click(within(nav).getByRole('button', { name: 'Trash' }));
    await screen.findByRole('heading', { level: 2, name: /Friday 20 November 2026/ });
    problems.push(...tabStopProblems('Trash'));
    await user.click(screen.getByRole('button', { name: /^Delete permanently/ }));
    problems.push(...tabStopProblems('Delete permanently dialog'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(within(nav).getByRole('button', { name: 'Settings' }));
    await screen.findByRole('list', { name: 'Backups in this folder' });
    problems.push(...tabStopProblems('Settings'));
    await user.click(screen.getByRole('button', { name: 'Change passphrase…' }));
    problems.push(...tabStopProblems('Passphrase dialog'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Choose a backup file…' }));
    await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    problems.push(...tabStopProblems('Restore dialog'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
    problems.push(...tabStopProblems('Erase dialog'));

    expect(problems).toEqual([]);
  });

  it('keeps every control of the startup screens in the Tab order', async () => {
    const problems: string[] = [];
    for (const state of ['needsMigration', 'unsupported', 'failed'] as const) {
      const { unmount } = render(<App api={createTestApi({ startup: { state } })} />);
      await screen.findByRole('heading', { level: 1 });
      problems.push(...tabStopProblems(`Startup: ${state}`));
      unmount();
    }
    expect(problems).toEqual([]);
  });

  it('reports a control without an explicit tab stop', () => {
    render(
      <div>
        <button type="button">Synthetic plain button</button>
        <button type="button" tabIndex={0}>
          Synthetic reachable button
        </button>
        <div role="toolbar" aria-label="Synthetic toolbar">
          <button type="button" tabIndex={0}>
            One
          </button>
          <button type="button" tabIndex={0}>
            Two
          </button>
        </div>
      </div>,
    );
    expect(tabStopProblems('Probe')).toEqual([
      'Probe: <button> “Synthetic plain button” has tabindex unset',
      'Probe: toolbar “Synthetic toolbar” has 2 tab stops',
    ]);
  });
});

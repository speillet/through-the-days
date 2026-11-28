import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createMemoryApi, createMemoryStorage, type MemoryApiOptions } from './api/memory';
import { flushAll, hasPending } from './state/flush';
import { TEST_NOW } from './test/render';

// The shell is tested with stand-ins for views owned by other features, so these
// tests describe the shell's own contract whatever those views render.
vi.mock('./features/today/TodayView', async () => {
  const { createElement, useState } = await import('react');
  const { useFocusMode } = await import('./state/focus');
  return {
    TodayView() {
      const { focusMode, setFocusMode } = useFocusMode();
      const [failing, setFailing] = useState(false);
      if (failing) throw new Error('Synthetic view failure');
      return createElement(
        'div',
        null,
        createElement('h1', null, 'Synthetic Today'),
        createElement('button', { type: 'button', onClick: () => setFocusMode(!focusMode) }, 'Toggle focus mode'),
        createElement('button', { type: 'button', onClick: () => setFailing(true) }, 'Simulate a view failure'),
      );
    },
  };
});
vi.mock('./features/trash/TrashView', async () => {
  const { createElement } = await import('react');
  return { TrashView: () => createElement('h1', null, 'Synthetic Trash') };
});
vi.mock('./features/backup/BackupBanner', async () => {
  const { createElement } = await import('react');
  const { useNavigation } = await import('./state/navigation');
  const { useStartup } = await import('./state/startup');
  return {
    BackupBanner() {
      const { navigate } = useNavigation();
      const { reloadJournal } = useStartup();
      return createElement(
        'div',
        null,
        createElement('p', null, 'Synthetic backup banner'),
        createElement(
          'button',
          { type: 'button', onClick: () => navigate('settings', { section: 'backups' }) },
          'Set up backups',
        ),
        createElement(
          'button',
          { type: 'button', onClick: () => reloadJournal('Synthetic restore complete.') },
          'Simulate restore',
        ),
      );
    },
  };
});
vi.mock('./features/startup/StartupGate', async () => {
  const { createElement } = await import('react');
  return { StartupGate: () => createElement('main', null, createElement('h1', null, 'Synthetic startup gate')) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.fontSize = '';
});

function renderApp(options: MemoryApiOptions = {}) {
  const storage = options.storage ?? createMemoryStorage();
  const api = createMemoryApi({ now: () => TEST_NOW, ...options, storage });
  const result = render(<App api={api} />);
  return { api, storage, ...result };
}

async function openWorkspace(options: MemoryApiOptions = {}) {
  const rendered = renderApp(options);
  await screen.findByRole('navigation', { name: 'Main' });
  return rendered;
}

/**
 * Opens the workspace and waits until the text-size shortcuts listen. They are installed by
 * an effect that may run after the navigation is shown, and a key press is not retried, so a
 * press sent before then is lost. Command-0 at the default size is claimed by the shortcut
 * (the event is prevented) but changes nothing, so it serves as the probe.
 */
async function openWorkspaceWithShortcuts(options: MemoryApiOptions = {}) {
  const rendered = await openWorkspace(options);
  const commandZero = { key: '0', code: 'Digit0', metaKey: true };
  await vi.waitFor(() => expect(fireEvent.keyDown(document.body, commandZero)).toBe(false));
  return rendered;
}

describe('application shell', () => {
  it('shows the startup gate, without navigation, until the journal is ready', async () => {
    renderApp({ startup: { state: 'needsMigration' } });
    expect(await screen.findByRole('heading', { name: 'Synthetic startup gate' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('opens Today and Settings offline, with no account and no network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    await openWorkspace();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic Today' })).toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Today' })).not.toHaveAttribute('aria-current');
    await user.click(within(nav).getByRole('button', { name: 'Trash' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic Trash' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/sign in|log in|account/i)).not.toBeInTheDocument();
  });

  it('keeps every label in English, with en-GB dates, on a French Mac', async () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'fr-FR', languages: ['fr-FR', 'fr'] });
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const text = document.body.textContent ?? '';
    expect(text).toContain('Sunday 22 November 2026');
    expect(text).toMatch(/Appearance.*Writing.*Time zone.*Gentle view/);
    expect(text).not.toMatch(/\b(?:paramètres|aujourd'hui|journal intime|corbeille|réglages|dimanche|novembre|thème|fuseau)\b/i);
  });

  it('lists later milestones as unavailable rather than as working views', async () => {
    await openWorkspace();
    const later = screen.getByRole('list', { name: 'Coming later' });
    const items = within(later).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.rail__label')?.textContent)).toEqual([
      'Keywords & Tags',
      'Goals & Counters',
      'CBT Exercises',
      'ChatGPT',
    ]);
    for (const item of items) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Not available yet');
      expect(within(item).queryByRole('button')).not.toBeInTheDocument();
      expect(within(item).queryByRole('link')).not.toBeInTheDocument();
      expect(item).not.toHaveAttribute('tabindex');
    }
  });

  it('offers a skip link first and moves through the rail with Tab and the arrow keys', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    const today = within(nav).getByRole('button', { name: 'Today' });
    const calendar = within(nav).getByRole('button', { name: 'Calendar' });
    const settings = within(nav).getByRole('button', { name: 'Settings' });
    today.focus();
    await user.keyboard('{ArrowDown}');
    expect(calendar).toHaveFocus();
    await user.keyboard('{End}');
    expect(settings).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(today).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(settings).toHaveFocus();
    await user.keyboard('{Home}');
    expect(today).toHaveFocus();
    await user.keyboard('{End}');
    expect(settings).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('reaches every rail control and the main view with Tab alone', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const expected = [
      screen.getByRole('link', { name: 'Skip to content' }),
      screen.getByRole('button', { name: 'Collapse sidebar' }),
      screen.getByRole('button', { name: 'Today' }),
      ...['Calendar','My Journal','Book View','Trends','Weekly Review','The Path So Far'].map((name)=>screen.getByRole('button',{name})),
      screen.getByRole('button', { name: 'Trash' }),
      screen.getByRole('button', { name: 'Settings' }),
      screen.getByRole('button', { name: 'Set up backups' }),
    ];
    for (const element of expected) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });

  it('collapses the sidebar and keeps that choice after a restart', async () => {
    const user = userEvent.setup();
    const { storage, unmount } = await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(nav).toHaveClass('rail--collapsed');
    expect(within(nav).getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(within(nav).queryByRole('list', { name: 'Coming later' })).not.toBeInTheDocument();
    unmount();

    await openWorkspace({ storage });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('restores a manual theme after a restart', async () => {
    const user = userEvent.setup();
    const { storage, unmount } = await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('radio', { name: /Dark/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    unmount();
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();

    await openWorkspace({ storage });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('enlarges, reduces and resets the text size with Command-plus, Command-minus and Command-0', async () => {
    const user = userEvent.setup();
    const { api } = await openWorkspaceWithShortcuts();
    const textScale = async () => (await api.getPreferences()).textScale;

    await user.keyboard('{Meta>}={/Meta}');
    await vi.waitFor(async () => expect(await textScale()).toBe(115));
    expect(document.documentElement.style.fontSize).toBe('115%');
    for (let press = 0; press < 3; press += 1) await user.keyboard('{Meta>}={/Meta}');
    await vi.waitFor(async () => expect(await textScale()).toBe(150));
    expect(document.documentElement.style.fontSize).toBe('150%');
    await user.keyboard('{Meta>}-{/Meta}');
    await vi.waitFor(async () => expect(await textScale()).toBe(130));
    await user.keyboard('{Meta>}0{/Meta}');
    await vi.waitFor(async () => expect(await textScale()).toBe(100));
    expect(document.documentElement.style.fontSize).toBe('');
    // Without Command the keys are ordinary typing.
    await user.keyboard('=');
    expect(await textScale()).toBe(100);
  });

  it('follows the characters of a French keyboard: the key labelled "-" reduces the text, ")" does nothing', async () => {
    const { api } = await openWorkspaceWithShortcuts();
    const textScale = async () => (await api.getPreferences()).textScale;
    // Deliberate multilingual synthetic fixture. On the French layout, "=" sits where US
    // keyboards have "/", "-" where they have "=", ")" where they have "-", and the key
    // that holds 0 types "à" without Shift.
    const press = (key: string, code: string) => fireEvent.keyDown(document.body, { key, code, metaKey: true });

    press('=', 'Slash');
    await vi.waitFor(async () => expect(await textScale()).toBe(115));
    press('=', 'Slash');
    await vi.waitFor(async () => expect(await textScale()).toBe(130));
    // Not a shortcut: the event is left alone.
    expect(press(')', 'Minus')).toBe(true);
    press('-', 'Equal');
    await vi.waitFor(async () => expect(await textScale()).toBe(115));
    expect(document.documentElement.style.fontSize).toBe('115%');
    press('à', 'Digit0');
    await vi.waitFor(async () => expect(await textScale()).toBe(100));
  });

  it('ignores the text-size shortcuts while a dialog is open', async () => {
    const user = userEvent.setup();
    const { api } = await openWorkspace();
    const writes = vi.spyOn(api, 'setPreferences');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
    expect(screen.getByRole('alertdialog', { name: 'Erase all app data?' })).toBeInTheDocument();

    await user.keyboard('{Meta>}={/Meta}');
    await user.keyboard('{Meta>}-{/Meta}');
    expect(writes).not.toHaveBeenCalled();
    expect(document.documentElement.style.fontSize).toBe('');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.keyboard('{Meta>}={/Meta}');
    await vi.waitFor(async () => expect((await api.getPreferences()).textScale).toBe(115));
  });

  it('keeps the display preferences of a restored backup when Command-plus is pressed during the restore', async () => {
    const user = userEvent.setup();
    const passphrase = 'fictional-harbour-compass';
    const storage = createMemoryStorage();
    const earlier = createMemoryApi({ storage, now: () => TEST_NOW });
    const backedUp = await earlier.setPreferences({
      ...(await earlier.getPreferences()),
      timeZone: 'America/New_York',
      theme: 'dark',
    });
    await earlier.chooseBackupFolder();
    await earlier.setBackupPassphrase(passphrase, false);
    await earlier.backupNow();
    await earlier.setPreferences({ ...backedUp, timeZone: 'Europe/Paris', theme: 'light' });

    const { api } = await openWorkspace({ storage });
    // As with the journal lock in the native app, a preference write sent while the
    // restore runs waits for it, then commits over the restored journal.
    let finishRestore = () => {};
    const restoring = new Promise<void>((resolve) => {
      finishRestore = resolve;
    });
    let restored: Promise<unknown> = Promise.resolve();
    const restoreBackup = api.restoreBackup.bind(api);
    const restore = vi.spyOn(api, 'restoreBackup').mockImplementation((...args) => {
      const outcome = restoring.then(() => restoreBackup(...args));
      restored = outcome;
      return outcome;
    });
    const setPreferences = api.setPreferences.bind(api);
    const writes = vi.spyOn(api, 'setPreferences').mockImplementation(async (preferences) => {
      await restored;
      return setPreferences(preferences);
    });

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await user.click(await screen.findByRole('button', { name: /^Restore the backup from/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Restore this backup?' });
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), passphrase);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    await vi.waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole('button', { name: 'Restoring…' })).toBeInTheDocument();

    await user.keyboard('{Meta>}={/Meta}');
    expect(writes).not.toHaveBeenCalled();

    finishRestore();
    expect(await screen.findByText(/^Backup restored:/)).toBeInTheDocument();
    expect(await screen.findByText('America/New York')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.fontSize).toBe('');
    expect(writes).not.toHaveBeenCalled();
    await expect(api.getPreferences()).resolves.toEqual(backedUp);
  });

  it('shows the backup banner above every view', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const main = screen.getByRole('main');
    for (const view of ['Today', 'Trash', 'Settings']) {
      await user.click(screen.getByRole('button', { name: view }));
      expect(within(main).getByText('Synthetic backup banner')).toBeInTheDocument();
    }
  });

  it('opens a requested settings section with its heading focused', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Set up backups' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Backups' })).toHaveFocus();
  });

  it('hides the navigation in focus mode and brings it back when leaving Today', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Toggle focus mode' }));
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic Today' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set up backups' }));
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('reopens the workspace after the journal is replaced and confirms it', async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Simulate restore' }));
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('Synthetic restore complete.');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    await user.click(within(confirmation).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Synthetic restore complete.')).not.toBeInTheDocument();
  });

  it('replaces only a failing view with a recoverable message until the person retries or navigates', async () => {
    // React also reports the caught failure on the console; this test reads the screen.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Toggle focus mode' }));
    await user.click(screen.getByRole('button', { name: 'Simulate a view failure' }));

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent("This view couldn't be shown.");
    expect(failure).toHaveTextContent('Your saved entries are not affected.');
    expect(screen.queryByRole('heading', { name: 'Synthetic Today' })).not.toBeInTheDocument();
    // The rest of the workspace stays: focus mode ends so the navigation returns, and the status area remains.
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(screen.getByText('Synthetic backup banner')).toBeInTheDocument();

    await user.click(within(failure).getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic Today' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simulate a view failure' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("This view couldn't be shown.");
    await user.click(within(nav).getByRole('button', { name: 'Trash' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic Trash' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Synthetic Today' })).toBeInTheDocument();
  });

  it('keeps unsaved weekly notes waiting for close and quit when their view fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const { api } = await openWorkspace();
    const save = vi
      .spyOn(api, 'saveWeeklyNotes')
      .mockRejectedValue({ code: 'storage', message: 'Synthetic notes save failure.' });
    await user.click(screen.getByRole('button', { name: 'Weekly Review' }));
    await user.type(await screen.findByRole('textbox', { name: 'Your notes' }), 'Synthetic pending note.');
    expect(await screen.findByText('Synthetic notes save failure.')).toBeInTheDocument();

    // Another view waits for the notes, which cannot be saved: the week stays open.
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByText(/These notes have changes that are not saved yet/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Synthetic Today' })).not.toBeInTheDocument();
    // Weekly Review itself then fails while reading its sources again.
    const sources = vi.spyOn(api, 'listEntries').mockImplementation(() => {
      throw new Error('Synthetic view failure');
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(await screen.findByText("This view couldn't be shown.")).toBeInTheDocument();
    sources.mockRestore();
    // Closing the window and quitting flush through this registry before they proceed.
    expect(hasPending()).toBe(true);
    save.mockRestore();
    await flushAll();
    expect(hasPending()).toBe(false);
    expect((await api.weeklyReview('2026-11-22')).notes).toBe('Synthetic pending note.');
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider, type JournalApi } from '../../api/client';
import { createMemoryApi, createMemoryStorage, ERROR_MESSAGES, MEMORY_STORAGE_KEY } from '../../api/memory';
import type { StartupStatus } from '../../api/types';
import { newDraft } from '../../domain/entry';
import { useStartup, StartupProvider, type StartupContextValue } from '../../state/startup';
import { createTestApi, TEST_NOW } from '../../test/render';
import { ERASED_NOTICE } from '../settings/EraseSection';
import { STILL_NOT_OPEN, StartupGate, UPGRADED_NOTICE } from './StartupGate';

const PASSPHRASE = 'fictional-lighthouse-maple';
const DATA_LOCATION = '/Users/fictional/Library/Application Support/com.throughthedays.app';

type User = ReturnType<typeof userEvent.setup>;

function renderGate(api: JournalApi) {
  const startup: { value: StartupContextValue | null } = { value: null };
  function Probe() {
    startup.value = useStartup();
    return null;
  }
  render(
    <ApiProvider api={api}>
      <StartupProvider>
        <Probe />
        <StartupGate />
      </StartupProvider>
    </ApiProvider>,
  );
  return { api, startup };
}

async function typePassphrase(user: User, passphrase = PASSPHRASE) {
  await user.type(screen.getByLabelText('Backup passphrase'), passphrase);
  await user.type(screen.getByLabelText('Confirm passphrase'), passphrase);
}

/**
 * A journal with one synthetic entry and one backup of it, then restarted in the given
 * startup state (or with its stored journal damaged), as a later launch would find it.
 */
async function journalWithBackup(relaunch: { startup?: Partial<StartupStatus>; damageJournal?: boolean } = {}) {
  const storage = createMemoryStorage();
  const options = { storage, now: () => TEST_NOW };
  const first = createMemoryApi(options);
  const entry = await first.saveEntry({
    ...newDraft('2026-11-21', 'evening', 'Europe/Paris'),
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fictional evening.' }] }] },
  });
  await first.chooseBackupFolder();
  await first.setBackupPassphrase(PASSPHRASE, false);
  await first.backupNow();
  if (relaunch.damageJournal) {
    const stored = JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    stored.journal = 'Synthetic damaged journal header';
    storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(stored));
  }
  return { api: createMemoryApi({ ...options, startup: { dataLocation: DATA_LOCATION, ...relaunch.startup } }), entry };
}

describe('startup gate', () => {
  it('says the journal is opening until it answers', async () => {
    const api = createTestApi();
    vi.spyOn(api, 'startupStatus').mockReturnValue(new Promise<StartupStatus>(() => {}));
    renderGate(api);
    expect(screen.getByRole('status')).toHaveTextContent('Opening your journal…');
  });

  it('reads the status again when it could not be read', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const startupStatus = vi
      .spyOn(api, 'startupStatus')
      .mockRejectedValueOnce('Synthetic invoke failure')
      .mockResolvedValueOnce({ state: 'ready', fromVersion: null, message: null, dataLocation: DATA_LOCATION });
    const { startup } = renderGate(api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(startupStatus).toHaveBeenCalledTimes(2);
  });
});

describe('startup gate: protected upgrade', () => {
  it('backs up the journal before upgrading it', async () => {
    const user = userEvent.setup();
    const { api, startup } = renderGate(createTestApi({ startup: { state: 'needsMigration' } }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Protect your journal before upgrading' }),
    ).toBeVisible();
    expect(screen.getByText(/Nothing has been changed yet\./)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Choose backup folder…' }));
    expect(await screen.findByText(/The backup will be saved in Synthetic backups/)).toBeVisible();
    await typePassphrase(user);
    expect(screen.getByRole('checkbox', { name: 'Remember in macOS Keychain' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));

    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(startup.value?.notice).toBe(UPGRADED_NOTICE);
    await expect(api.listBackups()).resolves.toHaveLength(1);
    await expect(api.backupStatus()).resolves.toMatchObject({ passphraseAvailable: true, remembered: false });
  });

  it('waits for a backup folder and a valid passphrase without touching the journal', async () => {
    const user = userEvent.setup();
    const api = createTestApi({ startup: { state: 'needsMigration' } });
    const migrate = vi.spyOn(api, 'migrateJournal');
    renderGate(api);
    await screen.findByRole('heading', { level: 1, name: 'Protect your journal before upgrading' });
    await typePassphrase(user);
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a backup folder first.');

    await user.click(screen.getByRole('button', { name: 'Choose backup folder…' }));
    await screen.findByText(/The backup will be saved in/);
    await user.clear(screen.getByLabelText('Confirm passphrase'));
    await user.type(screen.getByLabelText('Confirm passphrase'), 'a-different-passphrase');
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));
    expect(screen.getByLabelText('Confirm passphrase')).toHaveAccessibleDescription(
      /The two passphrases don’t match\./,
    );
    expect(migrate).not.toHaveBeenCalled();
  });

  it('keeps the journal unchanged when the pre-upgrade backup fails', async () => {
    const user = userEvent.setup();
    const api = createTestApi({ startup: { state: 'needsMigration' } });
    vi.spyOn(api, 'migrateJournal').mockRejectedValue({
      code: 'backup',
      message: 'The backup could not be created. Check the selected folder and available disk space, then try again.',
    });
    const { startup } = renderGate(api);
    await user.click(await screen.findByRole('button', { name: 'Choose backup folder…' }));
    await screen.findByText(/The backup will be saved in/);
    await typePassphrase(user);
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The journal was not upgraded');
    expect(alert).toHaveTextContent('The backup could not be created.');
    expect(alert).toHaveTextContent('Your journal has not been changed.');
    expect(startup.value?.status?.state).toBe('needsMigration');
    expect(screen.getByLabelText('Backup passphrase')).toHaveValue(PASSPHRASE);
  });

  it('says why the automatic upgrade at launch could not run', async () => {
    renderGate(
      createTestApi({ startup: { state: 'needsMigration', message: ERROR_MESSAGES.backupFolder } }),
    );
    await screen.findByRole('heading', { level: 1, name: 'Protect your journal before upgrading' });
    const notice = screen.getByText(ERROR_MESSAGES.backupFolder).closest('.notice') as HTMLElement;
    expect(notice).toHaveTextContent('The automatic upgrade could not run');
  });

  it('upgrades with the passphrase already remembered, keeping it remembered', async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const first = createMemoryApi({ storage, now: () => TEST_NOW });
    await first.chooseBackupFolder();
    await first.setBackupPassphrase(PASSPHRASE, true);
    const api = createMemoryApi({ storage, now: () => TEST_NOW, startup: { state: 'needsMigration' } });
    const migrate = vi.spyOn(api, 'migrateJournal');
    const { startup } = renderGate(api);

    await screen.findByText(/Your backup passphrase is remembered in macOS Keychain/);
    // Entering a new passphrase would also keep it remembered unless the box is unticked.
    expect(screen.getByRole('checkbox', { name: 'Remember in macOS Keychain' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Back up and upgrade with this passphrase' }));

    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(migrate).toHaveBeenCalledWith(null, true);
    expect(startup.value?.notice).toBe(UPGRADED_NOTICE);
    await expect(api.backupStatus()).resolves.toMatchObject({ remembered: true, backupCount: 1 });
  });
});

describe('startup gate: a journal that could not be opened', () => {
  it('tries to open the journal again, and opens the workspace once it can', async () => {
    const user = userEvent.setup();
    const api = createTestApi({ startup: { state: 'failed', dataLocation: DATA_LOCATION } });
    const retry = vi.spyOn(api, 'retryStartup');
    const startupStatus = vi.spyOn(api, 'startupStatus');
    const { startup } = renderGate(api);
    const heading = await screen.findByRole('heading', { level: 1, name: 'The journal could not be opened' });
    const card = heading.parentElement as HTMLElement;
    expect(within(card).getAllByRole('alert')[0]).toHaveTextContent(
      'The journal could not be opened. It has not been changed.',
    );
    expect(within(card).getByText(DATA_LOCATION)).toBeVisible();

    await user.click(within(card).getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(startupStatus).toHaveBeenCalledTimes(1);
  });

  it('says so when the journal still cannot be opened', async () => {
    const user = userEvent.setup();
    const { api } = await journalWithBackup({ damageJournal: true });
    renderGate(api);
    await screen.findByRole('heading', { level: 1, name: 'The journal could not be opened' });
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(ERROR_MESSAGES.damaged);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(STILL_NOT_OPEN)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'The journal could not be opened' })).toBeVisible();
  });

  it('restores a damaged journal from a backup file, keeping the damaged one aside', async () => {
    const user = userEvent.setup();
    const { api, entry } = await journalWithBackup({ damageJournal: true });
    const { startup } = renderGate(api);
    await screen.findByText(/If the journal file is damaged, restore your journal from a backup file\./);

    await user.click(screen.getByRole('button', { name: 'Restore from a backup file…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    expect(dialog).toHaveAccessibleDescription(/The journal that can’t be opened is kept aside in the app’s data folder/);
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), 'not-the-right-passphrase');
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The backup was not restored');
    expect(startup.value?.status?.state).toBe('failed');

    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(startup.value?.notice).toMatch(
      /^Backup restored: 1 entry in your journal\. The journal that could not be opened was kept in the app’s data folder as journal\.unreadable-\d+\.sqlite\.$/,
    );
    await expect(api.listEntries()).resolves.toEqual([entry]);
  });

  it('erases app data from the failed screen only after ERASE is typed', async () => {
    const user = userEvent.setup();
    const { api } = await journalWithBackup({ damageJournal: true });
    const erase = vi.spyOn(api, 'eraseAppData');
    const { startup } = renderGate(api);
    await user.click(await screen.findByRole('button', { name: 'Erase app data…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Erase all app data?' });
    expect(dialog).toHaveAccessibleDescription(/Backup files in your backup folder are not deleted/);
    await user.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'erase');
    await user.click(within(dialog).getByRole('button', { name: 'Erase all app data' }));
    expect(erase).not.toHaveBeenCalled();
    await user.clear(within(dialog).getByLabelText('Type ERASE to confirm'));
    await user.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'ERASE');
    await user.click(within(dialog).getByRole('button', { name: 'Erase all app data' }));

    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(startup.value?.notice).toBe(ERASED_NOTICE);
    await expect(api.listEntries()).resolves.toEqual([]);
  });
});

describe('startup gate: a journal this version cannot open', () => {
  it('tells a newer journal apart from a damaged one and offers both ways back', async () => {
    renderGate(createTestApi({ startup: { state: 'unsupported', dataLocation: DATA_LOCATION } }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This journal can’t be opened' })).toBeVisible();
    expect(
      screen.getByText(
        /created by a newer version of Through the Days or is not a journal database\. It has not been changed\./,
      ),
    ).toBeVisible();
    expect(screen.getByText(/If a newer version of Through the Days made this journal, install that version/)).toBeVisible();
    expect(screen.getByText(/If the journal file is damaged or is not a Through the Days journal/)).toBeVisible();
    expect(screen.getByText(DATA_LOCATION)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore from a backup file…' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Erase app data…' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back up and upgrade' })).not.toBeInTheDocument();
  });

  it('restores a backup over a journal this version cannot open', async () => {
    const user = userEvent.setup();
    const { api, entry } = await journalWithBackup({ startup: { state: 'unsupported' } });
    const { startup } = renderGate(api);
    await user.click(await screen.findByRole('button', { name: 'Restore from a backup file…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    await vi.waitFor(() => expect(startup.value?.status?.state).toBe('ready'));
    expect(startup.value?.notice).toMatch(/kept in the app’s data folder as journal\.unreadable-\d+\.sqlite\./);
    await expect(api.listEntries()).resolves.toEqual([entry]);
  });

  it('says when there is no backup file to restore', async () => {
    const user = userEvent.setup();
    const api = createTestApi({ startup: { state: 'unsupported' } });
    const choose = vi.spyOn(api, 'chooseRestoreFile');
    renderGate(api);
    await user.click(await screen.findByRole('button', { name: 'Restore from a backup file…' }));
    expect(choose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

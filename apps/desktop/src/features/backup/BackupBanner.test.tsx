import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JournalApi } from '../../api/client';
import { createMemoryApi, createMemoryStorage, ERROR_MESSAGES, MEMORY_STORAGE_KEY } from '../../api/memory';
import type { BackupStatus } from '../../api/types';
import { useFocusMode, type FocusModeContextValue } from '../../state/focus';
import { useNavigation, type NavigationContextValue } from '../../state/navigation';
import { createTestApi, renderWithProviders, TEST_NOW } from '../../test/render';
import { BackupBanner } from './BackupBanner';

const PASSPHRASE = 'fictional-orchard-lantern';

function renderBanner(api: JournalApi = createTestApi()) {
  const probes: { navigation: NavigationContextValue | null; focus: FocusModeContextValue | null } = {
    navigation: null,
    focus: null,
  };
  function Probe() {
    probes.navigation = useNavigation();
    probes.focus = useFocusMode();
    return null;
  }
  renderWithProviders(
    <>
      <Probe />
      <BackupBanner />
    </>,
    { api },
  );
  return { api, probes };
}

/** A journal whose backup folder is chosen but whose passphrase is not in this session. */
async function folderChosen() {
  const api = createTestApi();
  await api.chooseBackupFolder();
  return api;
}

function failedStatus(overrides: Partial<BackupStatus> = {}): BackupStatus {
  return {
    state: 'failed',
    folderName: 'Synthetic backups',
    folderPath: '~/Documents/Synthetic backups',
    passphraseAvailable: true,
    remembered: false,
    keychainPending: false,
    keychainWarning: null,
    lastSuccessDate: '2026-11-21',
    lastSuccessAt: 1795251600,
    lastError: {
      code: 'backup',
      message: 'The backup could not be created. Check the selected folder and available disk space, then try again.',
    },
    retentionWarning: false,
    backupCount: 4,
    ...overrides,
  };
}

async function enterPassphrase(user: ReturnType<typeof userEvent.setup>, first: string, second = first) {
  const dialog = screen.getByRole('dialog', { name: 'Enter your backup passphrase' });
  await user.type(within(dialog).getByLabelText('Backup passphrase'), first);
  await user.type(within(dialog).getByLabelText('Confirm passphrase'), second);
  return dialog;
}

describe('backup banner', () => {
  it('invites the person to set up backups and opens Settings at Backups', async () => {
    const user = userEvent.setup();
    const { probes } = renderBanner();
    expect(await screen.findByText(/Your journal isn’t backed up yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set up backups' }));
    expect(probes.navigation).toMatchObject({ view: 'settings', settingsSection: 'backups' });
  });

  it('lets the set-up prompt wait until the next launch', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(/Your journal isn’t backed up yet/)).not.toBeInTheDocument();
  });

  it('asks for the passphrase when a backup is due and confirms only once the backup exists', async () => {
    const user = userEvent.setup();
    const api = await folderChosen();
    renderBanner(api);
    const banner = await screen.findByRole('group', { name: 'Backup status' });
    expect(banner).toHaveTextContent('A backup is due');
    expect(banner).toHaveTextContent('You can keep writing in the meantime.');
    expect(within(banner).queryByRole('button', { name: /Dismiss|Not now/ })).not.toBeInTheDocument();

    await user.click(within(banner).getByRole('button', { name: 'Enter passphrase' }));
    const dialog = await enterPassphrase(user, PASSPHRASE);
    expect(dialog).toHaveAccessibleDescription(/Backups can’t be restored without it, on this Mac or any other/);
    expect(dialog).toHaveAccessibleDescription(/Existing backups keep the passphrase they were made with/);
    expect(within(dialog).getByRole('checkbox', { name: 'Remember in macOS Keychain' })).not.toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Save and back up' }));

    expect(await screen.findByText('Today’s backup is done.')).toBeInTheDocument();
    const status = await api.backupStatus();
    expect(status).toMatchObject({
      state: 'upToDate',
      remembered: false,
      backupCount: 1,
      lastSuccessDate: '2026-11-22',
    });
    await expect(api.listBackups()).resolves.toHaveLength(1);
  });

  it('checks a new passphrase before sending it', async () => {
    const user = userEvent.setup();
    const api = await folderChosen();
    const setPassphrase = vi.spyOn(api, 'setBackupPassphrase');
    renderBanner(api);
    await user.click(await screen.findByRole('button', { name: 'Enter passphrase' }));

    // Focus moves to the field to correct, so VoiceOver reads its error.
    let dialog = await enterPassphrase(user, 'too short');
    await user.click(within(dialog).getByRole('button', { name: 'Save and back up' }));
    const passphraseField = within(dialog).getByLabelText('Backup passphrase');
    expect(passphraseField).toHaveAccessibleDescription(/Use at least 12 characters\./);
    expect(passphraseField).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Enter passphrase' }));
    dialog = await enterPassphrase(user, PASSPHRASE, `${PASSPHRASE}!`);
    await user.click(within(dialog).getByRole('button', { name: 'Save and back up' }));
    const confirmationField = within(dialog).getByLabelText('Confirm passphrase');
    expect(confirmationField).toHaveAccessibleDescription(/The two passphrases don’t match\./);
    expect(confirmationField).toHaveFocus();
    expect(setPassphrase).not.toHaveBeenCalled();
    await expect(api.backupStatus()).resolves.toMatchObject({ state: 'needsPassphrase', backupCount: 0 });
  });

  it('remembers the passphrase in Keychain only when asked', async () => {
    const user = userEvent.setup();
    const api = await folderChosen();
    renderBanner(api);
    await user.click(await screen.findByRole('button', { name: 'Enter passphrase' }));
    const dialog = await enterPassphrase(user, PASSPHRASE);
    await user.click(within(dialog).getByRole('checkbox', { name: 'Remember in macOS Keychain' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save and back up' }));
    await screen.findByText('Today’s backup is done.');
    await expect(api.backupStatus()).resolves.toMatchObject({ remembered: true });
  });

  it('reports a failed backup with Try again and never claims success before the journal does', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    vi.spyOn(api, 'runDailyBackup').mockResolvedValue(failedStatus());
    vi.spyOn(api, 'backupStatus').mockResolvedValue(failedStatus());
    const backupNow = vi
      .spyOn(api, 'backupNow')
      .mockRejectedValueOnce({ code: 'backup', message: 'The backup could not be created. Check the selected folder.' })
      .mockResolvedValueOnce(failedStatus({ state: 'upToDate', lastError: null, lastSuccessDate: '2026-11-22' }));
    renderBanner(api);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Backup failed');
    expect(alert).toHaveTextContent('The backup could not be created.');
    expect(alert).toHaveTextContent('Earlier backups are not affected.');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Backup failed');
    expect(screen.queryByText('Today’s backup is done.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Today’s backup is done.')).toBeInTheDocument();
    expect(backupNow).toHaveBeenCalledTimes(2);
  });

  it('stays visible in Gentle view', async () => {
    const api = await folderChosen();
    await api.setPreferences({ ...(await api.getPreferences()), gentle: true });
    renderBanner(api);
    expect(await screen.findByRole('button', { name: 'Enter passphrase' })).toBeInTheDocument();
  });

  it('keeps only essential messages in focus mode', async () => {
    const { probes } = renderBanner();
    await screen.findByText(/Your journal isn’t backed up yet/);
    act(() => probes.focus?.setFocusMode(true));
    expect(screen.queryByText(/Your journal isn’t backed up yet/)).not.toBeInTheDocument();
  });

  it('keeps a passphrase request visible in focus mode', async () => {
    const { probes } = renderBanner(await folderChosen());
    await screen.findByRole('button', { name: 'Enter passphrase' });
    act(() => probes.focus?.setFocusMode(true));
    expect(screen.getByRole('button', { name: 'Enter passphrase' })).toBeInTheDocument();
  });

  it('warns when older backups could not be pruned', async () => {
    const api = createTestApi();
    const warning = failedStatus({ state: 'upToDate', lastError: null, retentionWarning: true });
    vi.spyOn(api, 'runDailyBackup').mockResolvedValue(warning);
    vi.spyOn(api, 'backupStatus').mockResolvedValue(warning);
    renderBanner(api);
    expect(await screen.findByText(/Some older backups could not be removed safely, so they were kept/)).toBeVisible();
    expect(screen.getByText(/Nothing was deleted/)).toBeVisible();
  });

  it('says when the backup settings could not be read, and never lets that be dismissed', async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const first = createMemoryApi({ storage, now: () => TEST_NOW });
    await first.chooseBackupFolder();
    const stored = JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    stored.plan = { folderChosen: true, unknownField: 'written by a newer version' };
    storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(stored));
    const { probes } = renderBanner(createMemoryApi({ storage, now: () => TEST_NOW }));

    const banner = await screen.findByRole('group', { name: 'Backup status' });
    expect(banner).toHaveTextContent('Backup settings could not be read');
    expect(banner).toHaveTextContent(
      'Backup settings on this Mac could not be read. Choose your backup folder and passphrase again; earlier backups are not affected.',
    );
    expect(banner).not.toHaveTextContent('Your journal isn’t backed up yet');
    expect(within(banner).queryByRole('button', { name: /Dismiss|Not now/ })).not.toBeInTheDocument();
    act(() => probes.focus?.setFocusMode(true));
    expect(screen.getByText(/Backup settings on this Mac could not be read\./)).toBeInTheDocument();
    act(() => probes.focus?.setFocusMode(false));
    await user.click(within(banner).getByRole('button', { name: 'Backup settings' }));
    expect(probes.navigation).toMatchObject({ view: 'settings', settingsSection: 'backups' });
  });

  it('offers another folder, and no pointless retry, when the folder’s list of backups is damaged', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    await api.setBackupPassphrase(PASSPHRASE, false);
    const damaged = failedStatus({ lastError: { code: 'backupRegistry', message: ERROR_MESSAGES.backupRegistry } });
    vi.spyOn(api, 'runDailyBackup').mockResolvedValueOnce(damaged);
    const backupStatus = vi.spyOn(api, 'backupStatus').mockResolvedValueOnce(damaged);
    const choose = vi.spyOn(api, 'chooseBackupFolder');
    renderBanner(api);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.backupRegistry);
    expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    backupStatus.mockRestore();
    await user.click(within(alert).getByRole('button', { name: 'Choose another folder…' }));
    expect(choose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Today’s backup is done.')).toBeInTheDocument();
    await expect(api.listBackups()).resolves.toHaveLength(1);
  });

  it('offers both trying again and another folder when the folder is unavailable', async () => {
    const api = createTestApi();
    const unavailable = failedStatus({ lastError: { code: 'backupFolder', message: ERROR_MESSAGES.backupFolder } });
    vi.spyOn(api, 'runDailyBackup').mockResolvedValue(unavailable);
    vi.spyOn(api, 'backupStatus').mockResolvedValue(unavailable);
    renderBanner(api);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`${ERROR_MESSAGES.backupFolder} Earlier backups are not affected.`);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Choose another folder…' })).toBeInTheDocument();
  });

  it('makes the due backup when macOS Keychain refuses the change, and says how to remove what it kept', async () => {
    const user = userEvent.setup();
    const api = await folderChosen();
    const setBackupPassphrase = api.setBackupPassphrase.bind(api);
    // The native shell keeps the passphrase for the session and says what Keychain did not do.
    vi.spyOn(api, 'setBackupPassphrase').mockImplementation(async (passphrase) => ({
      ...(await setBackupPassphrase(passphrase, false)),
      keychainWarning: 'notRemoved',
    }));
    renderBanner(api);
    await user.click(await screen.findByRole('button', { name: 'Enter passphrase' }));
    const dialog = await enterPassphrase(user, PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Save and back up' }));

    expect(await screen.findByText('Today’s backup is done.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(api.listBackups()).resolves.toHaveLength(1);
    const warning = screen
      .getByText(/macOS Keychain could not remove the passphrase it may have remembered before/)
      .closest('.notice') as HTMLElement;
    expect(warning).toHaveTextContent(
      'You can delete it yourself in the Keychain Access app: search for “throughthedays”.',
    );
    await user.click(within(warning).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/macOS Keychain could not remove/)).not.toBeInTheDocument();
    expect(screen.getByText('Today’s backup is done.')).toBeInTheDocument();
  });

  it('says when the launch still waits for macOS Keychain, and still offers to enter the passphrase', async () => {
    const api = await folderChosen();
    const waiting: BackupStatus = { ...(await api.backupStatus()), remembered: true, keychainPending: true };
    vi.spyOn(api, 'runDailyBackup').mockImplementation(async () => ({ ...waiting }));
    vi.spyOn(api, 'backupStatus').mockImplementation(async () => ({ ...waiting }));
    renderBanner(api);
    const banner = await screen.findByRole('group', { name: 'Backup status' });
    expect(banner).toHaveTextContent('A backup is due');
    expect(banner).toHaveTextContent(
      'Waiting for macOS Keychain: answer its prompt, which may be behind this window, to use your remembered backup passphrase. You can also enter the passphrase yourself, and keep writing in the meantime.',
    );
    expect(within(banner).getByRole('button', { name: 'Enter passphrase' })).toBeInTheDocument();
  });

  it('keeps a remembered passphrase remembered when it is entered again', async () => {
    const user = userEvent.setup();
    const api = await folderChosen();
    const due: BackupStatus = { ...(await api.backupStatus()), remembered: true };
    vi.spyOn(api, 'runDailyBackup').mockResolvedValue(due);
    vi.spyOn(api, 'backupStatus').mockResolvedValue(due);
    renderBanner(api);
    await user.click(await screen.findByRole('button', { name: 'Enter passphrase' }));
    const dialog = screen.getByRole('dialog', { name: 'Enter your backup passphrase' });
    expect(within(dialog).getByRole('checkbox', { name: 'Remember in macOS Keychain' })).toBeChecked();
  });
});

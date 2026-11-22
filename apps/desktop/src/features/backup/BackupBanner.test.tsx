import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JournalApi } from '../../api/client';
import type { BackupStatus } from '../../api/types';
import { useFocusMode, type FocusModeContextValue } from '../../state/focus';
import { useNavigation, type NavigationContextValue } from '../../state/navigation';
import { createTestApi, renderWithProviders } from '../../test/render';
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

    let dialog = await enterPassphrase(user, 'too short');
    await user.click(within(dialog).getByRole('button', { name: 'Save and back up' }));
    expect(within(dialog).getByLabelText('Backup passphrase')).toHaveAccessibleDescription(
      /Use at least 12 characters\./,
    );

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Enter passphrase' }));
    dialog = await enterPassphrase(user, PASSPHRASE, `${PASSPHRASE}!`);
    await user.click(within(dialog).getByRole('button', { name: 'Save and back up' }));
    expect(within(dialog).getByLabelText('Confirm passphrase')).toHaveAccessibleDescription(
      /The two passphrases don’t match\./,
    );
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
});

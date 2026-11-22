import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { JournalApi } from '../../api/client';
import type { BackupStatus, Entry } from '../../api/types';
import { newDraft } from '../../domain/entry';
import { useStartup, type StartupContextValue } from '../../state/startup';
import { createTestApi, renderWithProviders } from '../../test/render';
import { BackupSection } from './BackupSection';

const PASSPHRASE = 'fictional-harbour-compass';
const NEW_PASSPHRASE = 'another-fictional-meadow';

type User = ReturnType<typeof userEvent.setup>;

function documentOf(text: string): Entry['document'] {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

async function renderSection(api: JournalApi = createTestApi()) {
  const startup: { value: StartupContextValue | null } = { value: null };
  function StartupProbe() {
    startup.value = useStartup();
    return null;
  }
  renderWithProviders(
    <>
      <StartupProbe />
      <BackupSection />
    </>,
    { api, initialView: 'settings' },
  );
  await screen.findByRole('heading', { level: 3, name: 'Status' });
  return { api, startup };
}

async function setPassphrase(user: User, passphrase: string, options: { remember?: boolean } = {}) {
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('Backup passphrase'), passphrase);
  await user.type(within(dialog).getByLabelText('Confirm passphrase'), passphrase);
  if (options.remember) await user.click(within(dialog).getByRole('checkbox', { name: 'Remember in macOS Keychain' }));
  await user.click(within(dialog).getByRole('button', { name: /^Save/ }));
}

/** Folder chosen, passphrase set and the day's backup made, through the interface. */
async function setUpBackups(user: User) {
  await user.click(screen.getByRole('button', { name: 'Choose backup folder…' }));
  await user.click(screen.getByRole('button', { name: 'Set passphrase…' }));
  await setPassphrase(user, PASSPHRASE);
  await screen.findByText('Today’s backup is done.');
}

/** The status details (folder, passphrase, last backup, count). */
function facts() {
  const list = document.querySelector<HTMLElement>('dl.backup-facts');
  if (!list) throw new Error('The backup status details are not shown.');
  return list;
}

describe('Backups settings', () => {
  it('explains what backups do before anything is set up', async () => {
    await renderSection();
    const text = document.body.textContent ?? '';
    expect(text).toContain('encrypted with your backup passphrase');
    expect(text).toContain('one backup a day. If it was closed, it catches up the next time you open it.');
    expect(text).toContain('The 30 most recent backups are kept.');
    expect(text).toContain('The app never uploads backups.');
    expect(text).toContain('Backups are not set up yet.');
    expect(facts()).toHaveTextContent('Backup folderNot chosen yet');
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeDisabled();
    expect(screen.getByText('Choose a backup folder first.')).toBeInTheDocument();
  });

  it('chooses a folder, sets a passphrase for this session and makes the due backup', async () => {
    const user = userEvent.setup();
    const { api } = await renderSection();
    await user.click(screen.getByRole('button', { name: 'Choose backup folder…' }));
    expect(await screen.findByText('Backups will be saved in Synthetic backups.')).toBeInTheDocument();
    expect(facts()).toHaveTextContent('~/Documents/Synthetic backups');

    await user.click(screen.getByRole('button', { name: 'Set passphrase…' }));
    const dialog = screen.getByRole('dialog', { name: 'Set a backup passphrase' });
    expect(dialog).toHaveAccessibleDescription(/Store this passphrase somewhere safe/);
    expect(within(dialog).getByRole('checkbox', { name: 'Remember in macOS Keychain' })).not.toBeChecked();
    await setPassphrase(user, PASSPHRASE);

    expect(await screen.findByText(/Passphrase saved for this session/)).toBeInTheDocument();
    expect(await screen.findByText('Today’s backup is done.')).toBeInTheDocument();
    expect(facts()).toHaveTextContent('Last successful backup22 November 2026 at 10:00');
    expect(facts()).toHaveTextContent('Backups kept1 of up to 30');
    expect(facts()).toHaveTextContent('Entered for this session only.');
    await expect(api.backupStatus()).resolves.toMatchObject({ remembered: false, backupCount: 1 });
  });

  it('explains that a changed passphrase applies to new backups only', async () => {
    const user = userEvent.setup();
    const { api } = await renderSection();
    await setUpBackups(user);
    expect(
      screen.getByText(/existing backups keep the passphrase they were made with, and new backups use the new one/),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Change passphrase…' }));
    expect(screen.getByRole('dialog', { name: 'Change the backup passphrase' })).toHaveAccessibleDescription(
      /Existing backups keep the passphrase they were made with\. New backups use the one you enter here\./,
    );
    await setPassphrase(user, NEW_PASSPHRASE, { remember: true });
    expect(await screen.findByText('Passphrase saved and remembered in macOS Keychain.')).toBeInTheDocument();
    expect(facts()).toHaveTextContent('Remembered in macOS Keychain on this Mac.');

    // The backup made before the change still opens only with its own passphrase.
    const [first] = await api.listBackups();
    await expect(api.restoreBackup({ kind: 'registered', name: first.name }, NEW_PASSPHRASE)).rejects.toMatchObject({
      code: 'restore',
    });
  });

  it('backs up now and lists the new backup for restore', async () => {
    const user = userEvent.setup();
    const { api } = await renderSection();
    await setUpBackups(user);
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(
      await screen.findByText('Backup complete. Last successful backup: 22 November 2026 at 10:00.'),
    ).toBeVisible();
    expect(facts()).toHaveTextContent('Backups kept2 of up to 30');
    const list = await screen.findByRole('list', { name: 'Backups in this folder' });
    expect(
      within(list).getAllByRole('button', { name: 'Restore the backup from 22 November 2026 at 10:00…' }),
    ).toHaveLength(2);
    await expect(api.listBackups()).resolves.toHaveLength(2);
  });

  it('asks for the passphrase before backing up when it is not in this session', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    await api.chooseBackupFolder();
    await renderSection(api);
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    await setPassphrase(user, PASSPHRASE);
    expect(await screen.findByText(/^Backup complete\./)).toBeVisible();
    await expect(api.backupStatus()).resolves.toMatchObject({ state: 'upToDate', backupCount: 1 });
  });

  it('forgets the passphrase on this Mac', async () => {
    const user = userEvent.setup();
    const { api } = await renderSection();
    await setUpBackups(user);
    await user.click(screen.getByRole('button', { name: 'Forget passphrase' }));
    expect(await screen.findByText(/The passphrase was forgotten on this Mac/)).toBeVisible();
    expect(facts()).toHaveTextContent('Not entered in this session.');
    await expect(api.backupStatus()).resolves.toMatchObject({ passphraseAvailable: false, remembered: false });
  });

  it('restores a listed backup with its passphrase, after a safety backup, and reopens the journal', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const kept = await api.saveEntry({
      ...newDraft('2026-11-21', 'evening', 'Europe/Paris'),
      document: documentOf('Fictional evening, backed up.'),
      mood: 4,
    });
    const { startup } = await renderSection(api);
    await setUpBackups(user);
    await api.saveEntry({
      ...newDraft('2026-11-22', 'morning', 'Europe/Paris'),
      document: documentOf('Fictional morning, written after the backup.'),
    });

    await user.click(await screen.findByRole('button', { name: /^Restore the backup from/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Restore this backup?' });
    expect(dialog).toHaveAccessibleDescription(/Backup from 22 November 2026 at 10:00/);
    expect(dialog).toHaveAccessibleDescription(/Restoring replaces the journal on this Mac/);
    expect(dialog).toHaveAccessibleDescription(/a safety backup of it is made in your backup folder first/);
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));

    await vi.waitFor(() =>
      expect(startup.value?.notice).toBe(
        'Backup restored: 1 entry in your journal. A safety backup of your previous journal was made first.',
      ),
    );
    await expect(api.listEntries()).resolves.toEqual([kept]);
    await expect(api.listBackups()).resolves.toHaveLength(2);
  });

  it('refuses a wrong passphrase and leaves the current journal unchanged', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const { startup } = await renderSection(api);
    await setUpBackups(user);
    const current = await api.saveEntry({
      ...newDraft('2026-11-22', 'morning', 'Europe/Paris'),
      document: documentOf('Fictional current entry.'),
    });

    await user.click(await screen.findByRole('button', { name: /^Restore the backup from/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Restore this backup?' });
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    expect(within(dialog).getByLabelText('Passphrase for this backup')).toHaveAccessibleDescription(
      /Enter the passphrase this backup was made with\./,
    );

    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), 'not-the-right-passphrase');
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The backup was not restored');
    expect(alert).toHaveTextContent('Your current journal is unchanged.');
    expect(within(dialog).getByLabelText('Passphrase for this backup')).toHaveValue('');
    expect(startup.value?.notice).toBeNull();
    await expect(api.listEntries()).resolves.toEqual([current]);
  });

  it('restores from a backup file chosen in the file picker', async () => {
    const user = userEvent.setup();
    const { api } = await renderSection();
    await setUpBackups(user);
    const [newest] = await api.listBackups();
    await user.click(screen.getByRole('button', { name: 'Choose a backup file…' }));
    expect(screen.getByRole('alertdialog', { name: 'Restore this backup?' })).toHaveAccessibleDescription(
      new RegExp(`Backup file: ${newest.name}`),
    );
  });

  it('restores a backup file on a fresh start with only the backup and its passphrase', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const original = await api.saveEntry({
      ...newDraft('2026-11-21', 'morning', 'Europe/Paris'),
      document: documentOf('Fictional entry from the old Mac.'),
      energy: 7,
    });
    await api.chooseBackupFolder();
    await api.setBackupPassphrase(PASSPHRASE, false);
    await api.backupNow();
    // Like a new Mac: no journal, no backup settings and no remembered passphrase.
    await api.eraseAppData('ERASE');
    await expect(api.backupStatus()).resolves.toMatchObject({ remembered: false, passphraseAvailable: false });
    const { startup } = await renderSection(api);

    await user.click(screen.getByRole('button', { name: 'Choose a backup file…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Restore this backup?' });
    expect(dialog).toHaveAccessibleDescription(/A safety backup of your current journal can’t be made first/);
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));

    await vi.waitFor(() => expect(startup.value?.notice).toBe('Backup restored: 1 entry in your journal.'));
    await expect(api.listEntries()).resolves.toEqual([original]);
  });

  it('shows the last failure, a retention warning and listing problems', async () => {
    const api = createTestApi();
    const failed: BackupStatus = {
      state: 'failed',
      folderName: 'Synthetic backups',
      folderPath: '~/Documents/Synthetic backups',
      passphraseAvailable: true,
      remembered: false,
      lastSuccessDate: '2026-11-20',
      lastSuccessAt: 1795165200,
      lastError: {
        code: 'backupValidation',
        message: 'Backup validation failed. The previous backups remain available.',
      },
      retentionWarning: true,
      backupCount: 30,
    };
    vi.spyOn(api, 'runDailyBackup').mockResolvedValue(failed);
    vi.spyOn(api, 'backupStatus').mockResolvedValue(failed);
    vi.spyOn(api, 'listBackups').mockRejectedValue({ code: 'backup', message: 'The backup folder could not be read.' });
    await renderSection(api);
    expect(await screen.findByText(/Backup validation failed\. The previous backups remain available\./)).toBeVisible();
    expect(screen.getByText(/Some older backups could not be removed safely/)).toBeVisible();
    expect(await screen.findByText(/The backups in this folder could not be listed\./)).toBeVisible();
    expect(facts()).toHaveTextContent('Last successful backup20 November 2026 at 10:00');
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { newDraft } from '../../domain/entry';
import { DEFAULT_PREFERENCES } from '../../domain/preferences';
import { useNavigation, type NavigationContextValue } from '../../state/navigation';
import { useStartup, type StartupContextValue } from '../../state/startup';
import { createTestApi, renderWithProviders } from '../../test/render';
import { ERASED_NOTICE, EraseSection } from './EraseSection';

async function renderErase(api = createTestApi()) {
  const probes: { startup: StartupContextValue | null; navigation: NavigationContextValue | null } = {
    startup: null,
    navigation: null,
  };
  function Probe() {
    probes.startup = useStartup();
    probes.navigation = useNavigation();
    return null;
  }
  renderWithProviders(
    <>
      <Probe />
      <EraseSection />
    </>,
    { api, initialView: 'settings' },
  );
  await screen.findByRole('button', { name: 'Erase all app data…' });
  return { api, probes };
}

describe('Erase app data', () => {
  it('states the scope and that backup files are not deleted', async () => {
    await renderErase();
    const text = document.body.textContent ?? '';
    expect(text).toContain('every journal entry, with its writing and check-in answers');
    expect(text).toContain('the trash');
    expect(text).toContain('your display preferences');
    expect(text).toContain('the backup settings on this Mac');
    expect(text).toContain('the backup passphrase, including the copy remembered in macOS Keychain');
    expect(text).toContain('Backup files in your backup folder are not deleted.');
    expect(text).toContain('Erasing is not forensic');
  });

  it('requires ERASE typed exactly before anything is erased', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const erase = vi.spyOn(api, 'eraseAppData');
    await renderErase(api);
    await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Erase all app data?' });
    expect(dialog).toHaveAccessibleDescription(/Backup files in your backup folder are not deleted/);
    const field = within(dialog).getByLabelText('Type ERASE to confirm');
    expect(field).toHaveFocus();
    await user.type(field, 'erase');
    await user.click(within(dialog).getByRole('button', { name: 'Erase all app data' }));
    expect(field).toHaveAccessibleDescription('Type ERASE in capital letters to confirm.');
    expect(erase).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('erases the journal, preferences and backup settings, keeps backup files, and opens a fresh journal', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const saved = await api.saveEntry(newDraft('2026-11-22', 'morning', 'Europe/Paris'));
    await api.trashEntry(saved.id, saved.revision);
    await api.saveEntry(newDraft('2026-11-22', 'evening', 'Europe/Paris'));
    await api.setPreferences({ ...DEFAULT_PREFERENCES, theme: 'dark', gentle: true });
    await api.chooseBackupFolder();
    await api.setBackupPassphrase('fictional-garden-lantern', true);
    await api.backupNow();
    const { probes } = await renderErase(api);

    await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Erase all app data?' });
    await user.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'ERASE');
    await user.click(within(dialog).getByRole('button', { name: 'Erase all app data' }));

    await vi.waitFor(() => expect(probes.startup?.notice).toBe(ERASED_NOTICE));
    expect(probes.startup?.status).toMatchObject({ state: 'ready' });
    expect(probes.navigation?.view).toBe('today');
    await expect(api.listEntries()).resolves.toEqual([]);
    await expect(api.listTrash()).resolves.toEqual([]);
    await expect(api.getPreferences()).resolves.toEqual(DEFAULT_PREFERENCES);
    await expect(api.backupStatus()).resolves.toMatchObject({
      state: 'needsFolder',
      passphraseAvailable: false,
      remembered: false,
      lastSuccessAt: null,
    });
    // The backup file itself is still in the folder for a later restore.
    await api.chooseBackupFolder();
    await expect(api.listBackups()).resolves.toHaveLength(1);
  });
});

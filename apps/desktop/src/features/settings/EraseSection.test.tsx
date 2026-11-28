import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERROR_MESSAGES } from '../../api/memory';
import { newDraft } from '../../domain/entry';
import { DEFAULT_PREFERENCES } from '../../domain/preferences';
import { registerFlusher, setPendingInputOpener, type PendingInput } from '../../state/flush';
import { useNavigation, type NavigationContextValue } from '../../state/navigation';
import { useStartup, type StartupContextValue } from '../../state/startup';
import { createTestApi, renderWithProviders } from '../../test/render';
import {
  ERASED_NOTICE,
  EraseSection,
  UNSAVED_WRITING_NOT_ERASED,
  UNSAVED_WRITING_SHOWN_NOT_ERASED,
} from './EraseSection';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

type User = ReturnType<typeof userEvent.setup>;

async function confirmErase(user: User) {
  await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Erase all app data?' });
  await user.type(within(dialog).getByLabelText('Type ERASE to confirm'), 'ERASE');
  await user.click(within(dialog).getByRole('button', { name: 'Erase all app data' }));
  return dialog;
}

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

  it('lists weekly notes, private milestones and local summaries in the section and its dialog', async () => {
    const user = userEvent.setup();
    await renderErase();
    const section = document.body.textContent ?? '';
    expect(section).toContain('your weekly notes and private milestones');
    expect(section).toContain('local weekly summaries');
    expect(section).toContain('Search uses a temporary index that is never stored.');
    // Weekly summaries are stored in the journal, so the section never says there are none.
    expect(section).not.toContain('keeps no generated summaries');
    await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Erase all app data?' });
    expect(dialog).toHaveAccessibleDescription(/your weekly notes and private milestones/);
    expect(dialog).toHaveAccessibleDescription(/local weekly summaries/);
  });

  it('explains that copies kept by Time Machine or a synced folder are not removed', async () => {
    const user = userEvent.setup();
    await renderErase();
    const section = document.body.textContent ?? '';
    expect(section).toContain('Copies made outside the app are not removed either.');
    expect(section).toContain(
      'Time Machine backups of this Mac, including its local snapshots, contain your journal unencrypted unless the backup disk is encrypted.',
    );
    expect(section).toContain('If iCloud Drive or another service syncs your backup folder');
    await user.click(screen.getByRole('button', { name: 'Erase all app data…' }));
    expect(screen.getByRole('alertdialog', { name: 'Erase all app data?' })).toHaveAccessibleDescription(
      /Time Machine backups of this Mac, including its local snapshots, contain your journal unencrypted/,
    );
  });

  it('erases nothing while writing is still waiting to be saved', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const erase = vi.spyOn(api, 'eraseAppData');
    const { probes } = await renderErase(api);
    // A save that could not finish keeps its input pending.
    cleanups.push(registerFlusher({ flush: async () => {}, hasPending: () => true }));
    const dialog = await confirmErase(user);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(UNSAVED_WRITING_NOT_ERASED);
    expect(erase).not.toHaveBeenCalled();
    expect(probes.startup?.journalKey).toBe(0);
  });

  it('opens the writing whose save still fails instead of erasing, and says why', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    const erase = vi.spyOn(api, 'eraseAppData');
    const { probes } = await renderErase(api);
    // Weekly notes whose save failed after Weekly Review had gone.
    const input: PendingInput = { kind: 'weeklyNotes', week: '2026-11-16' };
    const flush = vi.fn(async () => {});
    cleanups.push(registerFlusher({ flush, hasPending: () => true, pendingInput: () => input }));
    const open = vi.fn<(input: PendingInput, notice?: string) => void>();
    cleanups.push(setPendingInputOpener(open));
    await confirmErase(user);
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith(input, UNSAVED_WRITING_SHOWN_NOT_ERASED));
    expect(flush).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(erase).not.toHaveBeenCalled();
    expect(probes.startup?.journalKey).toBe(0);
  });

  it('reopens every view and says what remains when erasing stopped after the journal was erased', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    await api.saveEntry(newDraft('2026-11-22', 'morning', 'Europe/Paris'));
    const realErase = api.eraseAppData.bind(api);
    // Like the native app when Keychain refuses to delete the passphrase: the journal is
    // already erased and reopened, then the command reports the Keychain failure.
    vi.spyOn(api, 'eraseAppData').mockImplementation(async (confirmation) => {
      await realErase(confirmation);
      throw { code: 'keychain', message: ERROR_MESSAGES.keychain };
    });
    const { probes } = await renderErase(api);
    await confirmErase(user);

    await vi.waitFor(() => expect(probes.startup?.journalKey).toBe(1));
    expect(probes.startup?.noticeTone).toBe('warning');
    expect(probes.startup?.notice).toContain(
      'Your journal and backup settings on this Mac were erased, but the backup passphrase could not be removed from macOS Keychain.',
    );
    expect(probes.startup?.notice).toContain('search for “throughthedays”');
    expect(probes.navigation?.view).toBe('today');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await expect(api.listEntries()).resolves.toEqual([]);
  });

  it('reopens every view with a warning when erasing did not finish for another reason', async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    vi.spyOn(api, 'eraseAppData').mockRejectedValue({ code: 'storage', message: ERROR_MESSAGES.storage });
    const { probes } = await renderErase(api);
    await confirmErase(user);
    await vi.waitFor(() => expect(probes.startup?.journalKey).toBe(1));
    expect(probes.startup?.noticeTone).toBe('warning');
    expect(probes.startup?.notice).toBe(
      'Erasing did not finish, so some app data may still be on this Mac. The app reopened the journal as it is now: check what is left, then try erasing again.',
    );
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
    await api.saveWeeklyNotes('2026-11-22', 'Fictional weekly notes to erase.', 0);
    expect((await api.generateWeeklySummary('2026-11-22')).summary).not.toBeNull();
    await api.saveMilestone({
      id: '00000000-0000-4000-8000-000000000024',
      date: '2026-11-21',
      title: 'Fictional milestone to erase',
      notes: '',
      revision: 0,
    });
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
    await expect(api.weeklyReview('2026-11-22')).resolves.toMatchObject({ notes: '', revision: 0, summary: null });
    await expect(api.listMilestones()).resolves.toEqual([]);
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

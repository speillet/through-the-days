import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryApi, createMemoryStorage, ERROR_MESSAGES, MEMORY_STORAGE_KEY } from '../../api/memory';
import type { BackupStatus, RestoreOutcome } from '../../api/types';
import { newDraft } from '../../domain/entry';
import { registerFlusher } from '../../state/flush';
import { renderWithProviders, TEST_NOW } from '../../test/render';
import {
  RestoreDialog,
  restoredNotice,
  restoreFailureMessage,
  UNSAVED_WRITING_NOT_RESTORED,
  type RestoreTarget,
} from './RestoreDialog';

const PASSPHRASE = 'fictional-tidal-lantern';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

/** A journal with one entry backed up, a folder and a session passphrase; optionally with a damaged page. */
async function journal({ damaged = false } = {}) {
  const storage = createMemoryStorage();
  const api = createMemoryApi({ storage, now: () => TEST_NOW });
  const kept = await api.saveEntry({
    ...newDraft('2026-11-21', 'morning', 'Europe/Paris'),
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fictional morning.' }] }] },
  });
  await api.chooseBackupFolder();
  await api.setBackupPassphrase(PASSPHRASE, false);
  await api.backupNow();
  const [backup] = await api.listBackups();
  if (damaged) {
    const stored = JSON.parse(storage.getItem(MEMORY_STORAGE_KEY) ?? '{}') as { journal: { entries: unknown[] } };
    stored.journal.entries.push({ entry: 'Synthetic damaged page', trashedAt: null });
    storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(stored));
  }
  return { api, kept, backup, status: await api.backupStatus() };
}

function renderDialog(api: ReturnType<typeof createMemoryApi>, target: RestoreTarget, status: BackupStatus) {
  const onRestored = vi.fn<(outcome: RestoreOutcome) => void>();
  renderWithProviders(<RestoreDialog target={target} status={status} onClose={() => {}} onRestored={onRestored} />, {
    api,
    initialView: 'settings',
  });
  return { onRestored };
}

describe('restore dialog', () => {
  it('asks before restoring without a safety backup when the current journal cannot be read', async () => {
    const user = userEvent.setup();
    const { api, kept, backup, status } = await journal({ damaged: true });
    const restore = vi.spyOn(api, 'restoreBackup');
    const { onRestored } = renderDialog(api, { source: { kind: 'registered', name: backup.name }, label: 'Backup' }, status);
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('The backup was not restored');
    expect(alert).toHaveTextContent(ERROR_MESSAGES.safetyBackupFailed);
    expect(within(dialog).getByText(/Choose this only if your current journal is damaged\./)).toBeVisible();
    expect(onRestored).not.toHaveBeenCalled();
    // The verified passphrase stays for the confirmed restore.
    expect(within(dialog).getByLabelText('Passphrase for this backup')).toHaveValue(PASSPHRASE);

    await user.click(within(dialog).getByRole('button', { name: 'Restore without a safety backup' }));
    await vi.waitFor(() => expect(onRestored).toHaveBeenCalledWith({ entries: 1, safetyBackup: false, setAside: null }));
    expect(restore).toHaveBeenLastCalledWith({ kind: 'registered', name: backup.name }, PASSPHRASE, true);
    await expect(api.listEntries()).resolves.toEqual([kept]);
  });

  it('restores nothing while writing is still waiting to be saved', async () => {
    const user = userEvent.setup();
    const { api, backup, status } = await journal();
    const restore = vi.spyOn(api, 'restoreBackup');
    // A save that could not finish keeps its input pending.
    cleanups.push(registerFlusher({ flush: async () => {}, hasPending: () => true }));
    const { onRestored } = renderDialog(api, { source: { kind: 'registered', name: backup.name }, label: 'Backup' }, status);
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(UNSAVED_WRITING_NOT_RESTORED);
    expect(restore).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('says that a failed safety backup stopped the restore', async () => {
    const user = userEvent.setup();
    const { api, backup, status } = await journal();
    vi.spyOn(api, 'restoreBackup').mockRejectedValue({ code: 'backupFolder', message: ERROR_MESSAGES.backupFolder });
    renderDialog(api, { source: { kind: 'registered', name: backup.name }, label: 'Backup' }, status);
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      `A safety backup of your current journal could not be made first, so nothing was restored. ${ERROR_MESSAGES.backupFolder} Your current journal is unchanged.`,
    );
    expect(within(dialog).queryByRole('button', { name: 'Restore without a safety backup' })).not.toBeInTheDocument();
  });
});

describe('restore wording', () => {
  it('names what stopped a restore and always says the journal is unchanged', () => {
    expect(restoreFailureMessage({ code: 'restore', message: ERROR_MESSAGES.restore })).toBe(ERROR_MESSAGES.restore);
    expect(restoreFailureMessage({ code: 'backupRegistry', message: ERROR_MESSAGES.backupRegistry })).toBe(
      `A safety backup of your current journal could not be made first, so nothing was restored. ${ERROR_MESSAGES.backupRegistry} Your current journal is unchanged.`,
    );
    expect(restoreFailureMessage({ code: 'unknown', message: ERROR_MESSAGES.unknown })).toBe(
      'Something went wrong. Please try again. Your current journal is unchanged.',
    );
  });

  it('confirms a restore with what happened to the replaced journal', () => {
    expect(restoredNotice({ entries: 2, safetyBackup: true, setAside: null })).toBe(
      'Backup restored: 2 entries in your journal. A safety backup of your previous journal was made first.',
    );
    expect(restoredNotice({ entries: 1, safetyBackup: false, setAside: 'journal.unreadable-1795251600.sqlite' })).toBe(
      'Backup restored: 1 entry in your journal. The journal that could not be opened was kept in the app’s data folder as journal.unreadable-1795251600.sqlite.',
    );
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryApi, createMemoryStorage, ERROR_MESSAGES, MEMORY_STORAGE_KEY } from '../../api/memory';
import type { BackupStatus, RestoreOutcome } from '../../api/types';
import { newDraft } from '../../domain/entry';
import { registerFlusher, setPendingInputOpener, type PendingInput } from '../../state/flush';
import { renderWithProviders, TEST_NOW } from '../../test/render';
import {
  RestoreDialog,
  restoredNotice,
  restoreFailureMessage,
  UNSAVED_WRITING_NOT_RESTORED,
  UNSAVED_WRITING_SHOWN_NOT_RESTORED,
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
  const onClose = vi.fn();
  renderWithProviders(<RestoreDialog target={target} status={status} onClose={onClose} onRestored={onRestored} />, {
    api,
    initialView: 'settings',
  });
  return { onRestored, onClose };
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

  it('says what the safety backup protects: entries, weekly notes or milestones', async () => {
    const { api, backup, status } = await journal();
    renderDialog(api, { source: { kind: 'registered', name: backup.name }, label: 'Backup' }, status);
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    expect(dialog).toHaveAccessibleDescription(
      /If your current journal has entries, weekly notes or milestones, a safety backup of it is made in your backup folder first\./,
    );
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

  it('opens the writing whose save still fails instead of restoring, and says why', async () => {
    const user = userEvent.setup();
    const { api, backup, status } = await journal();
    const restore = vi.spyOn(api, 'restoreBackup');
    // An Evening entry whose save failed after its view had gone.
    const input: PendingInput = { kind: 'entry', date: '2026-11-22', slot: 'evening' };
    const flush = vi.fn(async () => {});
    cleanups.push(registerFlusher({ flush, hasPending: () => true, pendingInput: () => input }));
    const open = vi.fn<(input: PendingInput, notice?: string) => void>();
    cleanups.push(setPendingInputOpener(open));
    const { onRestored, onClose } = renderDialog(
      api,
      { source: { kind: 'registered', name: backup.name }, label: 'Backup' },
      status,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith(input, UNSAVED_WRITING_SHOWN_NOT_RESTORED));
    expect(flush).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('says that a failed safety backup stopped the restore, and restores once its cause is gone', async () => {
    const user = userEvent.setup();
    const { api, backup, status } = await journal();
    const restore = vi
      .spyOn(api, 'restoreBackup')
      .mockRejectedValueOnce({ code: 'backupFolder', message: ERROR_MESSAGES.backupFolder });
    const { onRestored } = renderDialog(api, { source: { kind: 'registered', name: backup.name }, label: 'Backup' }, status);
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    await user.type(within(dialog).getByLabelText('Passphrase for this backup'), PASSPHRASE);
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      `A safety backup of your current journal could not be made first, so nothing was restored. ${ERROR_MESSAGES.backupFolder} Your current journal is unchanged.`,
    );
    expect(within(dialog).queryByRole('button', { name: 'Restore without a safety backup' })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Passphrase for this backup')).toHaveValue(PASSPHRASE);

    // Once the backup drive is connected again, the same restore makes its safety backup.
    await user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    await vi.waitFor(() => expect(onRestored).toHaveBeenCalledWith({ entries: 1, safetyBackup: true, setAside: null }));
    expect(restore).toHaveBeenLastCalledWith({ kind: 'registered', name: backup.name }, PASSPHRASE, false);
  });

  it('keeps the passphrase after failures that do not involve it, and clears it after a refused one', async () => {
    const user = userEvent.setup();
    const { api, backup, status } = await journal();
    const restore = vi.spyOn(api, 'restoreBackup');
    const { onRestored } = renderDialog(api, { source: { kind: 'registered', name: backup.name }, label: 'Backup' }, status);
    const dialog = await screen.findByRole('alertdialog', { name: 'Restore this backup?' });
    const field = within(dialog).getByLabelText('Passphrase for this backup');
    const submit = () => user.click(within(dialog).getByRole('button', { name: 'Replace journal and restore' }));
    await user.type(field, PASSPHRASE);

    // The backup drive was disconnected, then the data folder was full.
    for (const code of ['backupUnavailable', 'storage'] as const) {
      restore.mockRejectedValueOnce({ code, message: ERROR_MESSAGES[code] });
      await submit();
      await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(ERROR_MESSAGES[code]));
      expect(within(dialog).getByRole('alert')).not.toHaveTextContent('A safety backup');
      expect(field).toHaveValue(PASSPHRASE);
    }

    await user.clear(field);
    await user.type(field, 'not the synthetic passphrase');
    await submit();
    await vi.waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(ERROR_MESSAGES.restore));
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(onRestored).not.toHaveBeenCalled();
  });
});

describe('restore wording', () => {
  it('names what stopped a restore and always says the journal is unchanged', () => {
    expect(restoreFailureMessage({ code: 'restore', message: ERROR_MESSAGES.restore })).toBe(ERROR_MESSAGES.restore);
    // A backup that cannot be reached is not a failed safety backup.
    expect(restoreFailureMessage({ code: 'backupUnavailable', message: ERROR_MESSAGES.backupUnavailable })).toBe(
      ERROR_MESSAGES.backupUnavailable,
    );
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

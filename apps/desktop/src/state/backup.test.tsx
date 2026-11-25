import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider, type JournalApi } from '../api/client';
import { createMemoryApi, createMemoryStorage } from '../api/memory';
import { newDraft } from '../domain/entry';
import { BackupProvider, useBackup } from './backup';
import { TodayProvider } from './clock';
import { PreferencesProvider } from './preferences';

afterEach(() => {
  vi.useRealTimers();
});

const PASSPHRASE = 'synthetic passphrase one';
const DAY_MS = 86_400_000;

function Probe() {
  const { status } = useBackup();
  return <p>{status ? `Backup ${status.state}, ${status.backupCount} saved` : 'No status yet'}</p>;
}

function renderBackup(api: JournalApi, intervalMs?: number, keychainRecheckMs?: number) {
  render(
    <ApiProvider api={api}>
      <PreferencesProvider>
        <TodayProvider>
          <BackupProvider intervalMs={intervalMs} keychainRecheckMs={keychainRecheckMs}>
            <Probe />
          </BackupProvider>
        </TodayProvider>
      </PreferencesProvider>
    </ApiProvider>,
  );
}

async function preparedJournal() {
  let now = new Date('2026-11-22T09:00:00Z');
  const api = createMemoryApi({ storage: createMemoryStorage(), now: () => now });
  await api.chooseBackupFolder();
  await api.setBackupPassphrase(PASSPHRASE, false);
  return {
    api,
    advanceDays(days: number) {
      now = new Date(now.getTime() + days * DAY_MS);
    },
  };
}

describe('BackupProvider', () => {
  it('runs the daily backup and the trash purge as soon as the journal is open', async () => {
    const { api } = await preparedJournal();
    const purge = vi.spyOn(api, 'purgeExpiredTrash');
    renderBackup(api);
    expect(await screen.findByText('Backup upToDate, 1 saved')).toBeInTheDocument();
    expect(purge).toHaveBeenCalled();
  });

  it('keeps daily backups running in Gentle view', async () => {
    const { api } = await preparedJournal();
    await api.setPreferences({ ...(await api.getPreferences()), gentle: true });
    renderBackup(api);
    expect(await screen.findByText('Backup upToDate, 1 saved')).toBeInTheDocument();
  });

  it('reports a pending backup when the passphrase is unavailable, without blocking', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    await api.chooseBackupFolder();
    renderBackup(api);
    expect(await screen.findByText('Backup needsPassphrase, 0 saved')).toBeInTheDocument();
  });

  it('catches up again every ten minutes while active', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const journal = await preparedJournal();
    renderBackup(journal.api);
    expect(await screen.findByText('Backup upToDate, 1 saved')).toBeInTheDocument();
    journal.advanceDays(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(screen.getByText('Backup upToDate, 2 saved')).toBeInTheDocument();
  });

  it('runs again when the window regains focus', async () => {
    const journal = await preparedJournal();
    const run = vi.spyOn(journal.api, 'runDailyBackup');
    renderBackup(journal.api);
    await screen.findByText('Backup upToDate, 1 saved');
    const calls = run.mock.calls.length;
    journal.advanceDays(1);
    fireEvent.focus(window);
    expect(await screen.findByText('Backup upToDate, 2 saved')).toBeInTheDocument();
    expect(run.mock.calls.length).toBeGreaterThan(calls);
  });

  it('purges expired trash before the daily backup, so the backup never contains it', async () => {
    const journal = await preparedJournal();
    const saved = await journal.api.saveEntry(newDraft('2026-11-21', 'morning', 'Europe/Paris'));
    await journal.api.trashEntry(saved.id, saved.revision);
    journal.advanceDays(31);
    const order: string[] = [];
    const purge = journal.api.purgeExpiredTrash.bind(journal.api);
    const daily = journal.api.runDailyBackup.bind(journal.api);
    vi.spyOn(journal.api, 'purgeExpiredTrash').mockImplementation(async () => {
      order.push('purge');
      await purge();
    });
    vi.spyOn(journal.api, 'runDailyBackup').mockImplementation(async () => {
      order.push('backup');
      return daily();
    });
    renderBackup(journal.api);
    expect(await screen.findByText('Backup upToDate, 1 saved')).toBeInTheDocument();
    expect(order.slice(0, 2)).toEqual(['purge', 'backup']);
    await expect(journal.api.listTrash()).resolves.toEqual([]);
  });

  it('purges trash whose retention has passed', async () => {
    const journal = await preparedJournal();
    const saved = await journal.api.saveEntry(newDraft('2026-11-22', 'morning', 'Europe/Paris'));
    await journal.api.trashEntry(saved.id, saved.revision);
    journal.advanceDays(31);
    renderBackup(journal.api);
    await waitFor(async () => expect(await journal.api.listTrash()).toEqual([]));
  });

  it('looks again while the launch waits for macOS Keychain, then makes the due backup', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage(), now: () => new Date('2026-11-22T09:00:00Z') });
    await api.chooseBackupFolder();
    // The launch still reads the remembered passphrase: the session has none yet.
    const waiting = { ...(await api.backupStatus()), remembered: true, keychainPending: true };
    const runDailyBackup = api.runDailyBackup.bind(api);
    const run = vi.spyOn(api, 'runDailyBackup').mockImplementation(async () => ({ ...waiting }));
    renderBackup(api, undefined, 10);
    expect(await screen.findByText('Backup needsPassphrase, 0 saved')).toBeInTheDocument();
    await waitFor(() => expect(run.mock.calls.length).toBeGreaterThan(2));

    // The prompt is answered: the passphrase it returned is in the session.
    await api.setBackupPassphrase(PASSPHRASE, true);
    run.mockImplementation(runDailyBackup);
    expect(await screen.findByText('Backup upToDate, 1 saved')).toBeInTheDocument();
    const calls = run.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(run.mock.calls.length).toBe(calls);
  });

  it('falls back to the plain status when the routine fails', async () => {
    const journal = await preparedJournal();
    vi.spyOn(journal.api, 'runDailyBackup').mockRejectedValue({ code: 'backup', message: 'Synthetic failure.' });
    renderBackup(journal.api);
    expect(await screen.findByText('Backup due, 0 saved')).toBeInTheDocument();
  });
});

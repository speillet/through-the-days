// Backup status and the routine that keeps it honest: once the journal is open,
// purge expired trash and run the daily backup (D-007: catch up at launch, then
// daily while active), immediately, every ten minutes, on window focus and when
// the journal date changes. Purging first keeps trash past its 30 days out of the
// backup made right after. While the launch still waits for macOS Keychain to
// return the remembered passphrase, the routine looks again every few seconds.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toCommandError, useApi } from '../api/client';
import type { BackupStatus, CommandError } from '../api/types';
import { useToday } from './clock';

const MAINTENANCE_INTERVAL_MS = 10 * 60_000;
/** How soon the routine looks again while the launch waits for macOS Keychain. */
const KEYCHAIN_RECHECK_MS = 3_000;

export interface BackupContextValue {
  /** Null until the first status arrives. */
  status: BackupStatus | null;
  /** The last command error from the routine itself, if any. */
  error: CommandError | null;
  refresh(): Promise<void>;
  /** Applies a status returned by a backup command (folder, passphrase, backup now…). */
  setStatus(status: BackupStatus): void;
  /** Runs the trash purge and the daily backup now. */
  runMaintenance(): Promise<void>;
}

const BackupContext = createContext<BackupContextValue | null>(null);

export function BackupProvider({
  children,
  intervalMs = MAINTENANCE_INTERVAL_MS,
  keychainRecheckMs = KEYCHAIN_RECHECK_MS,
}: {
  children?: ReactNode;
  intervalMs?: number;
  keychainRecheckMs?: number;
}) {
  const api = useApi();
  const { today } = useToday();
  const [status, setStatusState] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<CommandError | null>(null);
  const running = useRef<Promise<void> | null>(null);

  const setStatus = useCallback((next: BackupStatus) => {
    setStatusState(next);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.backupStatus());
    } catch (caught) {
      setError(toCommandError(caught));
    }
  }, [api, setStatus]);

  const runMaintenance = useCallback(() => {
    if (running.current) return running.current;
    const run = (async () => {
      try {
        await api.purgeExpiredTrash();
      } catch {
        // Expired items are purged at the next run or at the next launch.
      }
      try {
        setStatus(await api.runDailyBackup());
      } catch (caught) {
        setError(toCommandError(caught));
        try {
          setStatusState(await api.backupStatus());
        } catch {
          // Keep the last known status.
        }
      }
    })().finally(() => {
      running.current = null;
    });
    running.current = run;
    return run;
  }, [api, setStatus]);

  useEffect(() => {
    void runMaintenance();
  }, [runMaintenance, today]);

  useEffect(() => {
    const timer = window.setInterval(() => void runMaintenance(), intervalMs);
    const onFocus = () => void runMaintenance();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [runMaintenance, intervalMs]);

  // A Keychain prompt can wait behind the window. Each status that still reports it
  // schedules another look, so the due backup runs soon after the prompt is answered.
  useEffect(() => {
    if (!status?.keychainPending) return undefined;
    const timer = window.setTimeout(() => void runMaintenance(), keychainRecheckMs);
    return () => window.clearTimeout(timer);
  }, [status, runMaintenance, keychainRecheckMs]);

  const value = useMemo(
    () => ({ status, error, refresh, setStatus, runMaintenance }),
    [status, error, refresh, setStatus, runMaintenance],
  );
  return <BackupContext.Provider value={value}>{children}</BackupContext.Provider>;
}

export function useBackup(): BackupContextValue {
  const value = useContext(BackupContext);
  if (!value) throw new Error('useBackup must be used inside <BackupProvider>.');
  return value;
}

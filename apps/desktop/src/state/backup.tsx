// Backup status and the routine that keeps it honest: once the journal is open,
// run the daily backup (D-007: catch up at launch, then daily while active) and
// purge expired trash, immediately, every ten minutes, on window focus and when
// the journal date changes.

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

export const MAINTENANCE_INTERVAL_MS = 10 * 60_000;

export interface BackupContextValue {
  /** Null until the first status arrives. */
  status: BackupStatus | null;
  /** The last command error from the routine itself, if any. */
  error: CommandError | null;
  refresh(): Promise<void>;
  /** Applies a status returned by a backup command (folder, passphrase, backup now…). */
  setStatus(status: BackupStatus): void;
  /** Runs the daily backup and trash purge now. */
  runMaintenance(): Promise<void>;
}

const BackupContext = createContext<BackupContextValue | null>(null);

export function BackupProvider({
  children,
  intervalMs = MAINTENANCE_INTERVAL_MS,
}: {
  children?: ReactNode;
  intervalMs?: number;
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
        setStatus(await api.runDailyBackup());
      } catch (caught) {
        setError(toCommandError(caught));
        try {
          setStatusState(await api.backupStatus());
        } catch {
          // Keep the last known status.
        }
      }
      try {
        await api.purgeExpiredTrash();
      } catch {
        // Expired items are purged at the next run or at the next launch.
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

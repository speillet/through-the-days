// Whether the journal is open, needs a protected migration, or cannot be used,
// and a way to reopen every view after the journal itself was replaced.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toCommandError, useApi } from '../api/client';
import type { CommandError, StartupStatus } from '../api/types';
import { discardAllSavers } from './autosave';

export interface StartupContextValue {
  /** Null until the first answer from the journal. */
  status: StartupStatus | null;
  /** Set when the startup status itself could not be read. */
  error: CommandError | null;
  refresh(): Promise<void>;
  /**
   * Applies a status returned by migrateJournal or eraseAppData and reopens the
   * workspace, with an optional English confirmation shown in the status area.
   */
  setStatus(status: StartupStatus, notice?: string): void;
  /**
   * Remounts every view so it re-reads the journal, for example after a restore.
   * Flush pending saves (state/flush.ts) before replacing the journal.
   */
  reloadJournal(notice?: string): void;
  /** Changes whenever the workspace is reopened; used as its React key. */
  journalKey: number;
  /** Confirmation to show once the workspace reopens. */
  notice: string | null;
  dismissNotice(): void;
}

const StartupContext = createContext<StartupContextValue | null>(null);

export function StartupProvider({ children }: { children?: ReactNode }) {
  const api = useApi();
  const [status, setStatusState] = useState<StartupStatus | null>(null);
  const [error, setError] = useState<CommandError | null>(null);
  const [journalKey, setJournalKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.startupStatus();
      setStatusState(next);
      setError(null);
    } catch (caught) {
      setError(toCommandError(caught));
    }
  }, [api]);

  const reloadJournal = useCallback((message?: string) => {
    // Input that still could not be saved belongs to the replaced journal; never
    // let it reach the new one (for example after erasing app data).
    discardAllSavers();
    setJournalKey((key) => key + 1);
    setNotice(message ?? null);
  }, []);

  const setStatus = useCallback(
    (next: StartupStatus, message?: string) => {
      setStatusState(next);
      setError(null);
      reloadJournal(message);
    },
    [reloadJournal],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, error, refresh, setStatus, reloadJournal, journalKey, notice, dismissNotice }),
    [status, error, refresh, setStatus, reloadJournal, journalKey, notice, dismissNotice],
  );
  return <StartupContext.Provider value={value}>{children}</StartupContext.Provider>;
}

export function useStartup(): StartupContextValue {
  const value = useContext(StartupContext);
  if (!value) throw new Error('useStartup must be used inside <StartupProvider>.');
  return value;
}

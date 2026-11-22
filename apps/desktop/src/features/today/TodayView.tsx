// Today: the open journal date, its Morning and Evening entries, and the writing
// workspace. The date opens on today and afterwards changes only through the
// person's navigation; pending input is saved before moving to another date or
// slot, and a failed save keeps the entry open instead of losing it.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { CommandError, Entry, Slot } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { settleDetachedSavers } from '../../state/autosave';
import { useToday } from '../../state/clock';
import { useFocusMode } from '../../state/focus';
import { useNavigation } from '../../state/navigation';
import { DateHeader } from './DateHeader';
import { EntryWorkspace, type EntryWorkspaceHandle } from './EntryWorkspace';
import { slotTabId, SlotTabs } from './SlotTabs';
import { entryStatus, type EntryStatus } from './status';
import './today.css';

interface Loaded {
  date: string;
  generation: number;
  entries: Entry[];
}

export interface TodayViewProps {
  /** Quiet period before an automatic save; tests shorten it. */
  autosaveDelayMs?: number;
}

export function TodayView({ autosaveDelayMs }: TodayViewProps = {}) {
  const api = useApi();
  const { today } = useToday();
  const { focusMode } = useFocusMode();
  const { navigate: openView } = useNavigation();
  const panelId = useId();
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<Slot>('morning');
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<CommandError | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<Partial<Record<Slot, EntryStatus>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const workspaceRef = useRef<EntryWorkspaceHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    void (async () => {
      // Input left behind by an earlier view is saved first, so this read is current.
      await settleDetachedSavers();
      try {
        const entries = await api.entriesOn(date);
        if (!active) return;
        setLiveStatuses({});
        setLoaded({ date, generation, entries });
      } catch (caught) {
        if (active) setLoadError(toCommandError(caught));
      }
    })();
    return () => {
      active = false;
    };
  }, [api, date, generation]);

  const current = loaded !== null && loaded.date === date && loaded.generation === generation ? loaded : null;
  const ready = current !== null;

  useEffect(() => {
    if (!ready || !focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  }, [ready]);

  const onStatusChange = useCallback((changed: Slot, status: EntryStatus) => {
    setLiveStatuses((known) => (known[changed] === status ? known : { ...known, [changed]: status }));
  }, []);

  const clearBlocked = useCallback(() => setBlocked(false), []);

  // No status until this date's entries are read, so another date's status never shows.
  const statusFor = (item: Slot): EntryStatus | null =>
    current ? (liveStatuses[item] ?? entryStatus(current.entries.find((entry) => entry.slot === item))) : null;

  async function go(nextDate: string, nextSlot: Slot) {
    if (nextDate === date && nextSlot === slot) return;
    const saved = (await workspaceRef.current?.flush()) ?? true;
    if (!saved) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    setNotice(null);
    setDate(nextDate);
    setSlot(nextSlot);
  }

  function reload() {
    setBlocked(false);
    setGeneration((value) => value + 1);
  }

  return (
    <div className="view today">
      <DateHeader
        date={date}
        today={today}
        compact={focusMode}
        headingRef={headingRef}
        onNavigate={(next) => void go(next, slot)}
      />

      {notice ? (
        <Notice
          tone="success"
          actions={
            <>
              <Button variant="quiet" size="small" onClick={() => openView('trash')}>
                Open Trash
              </Button>
              <Button variant="quiet" size="small" onClick={() => setNotice(null)}>
                Dismiss
              </Button>
            </>
          }
        >
          {notice}
        </Notice>
      ) : null}
      {blocked ? (
        <Notice tone="warning">
          This entry has changes that are not saved yet, so it stays open and nothing is lost. Once it is saved, you
          can move on.
        </Notice>
      ) : null}

      {focusMode ? null : (
        <SlotTabs
          slot={slot}
          statuses={{ morning: statusFor('morning'), evening: statusFor('evening') }}
          panelId={panelId}
          onSelect={(next) => void go(date, next)}
        />
      )}

      <div
        id={panelId}
        role={focusMode ? undefined : 'tabpanel'}
        aria-labelledby={focusMode ? undefined : slotTabId(slot)}
        className="today__panel"
      >
        {loadError ? (
          <Notice
            tone="error"
            actions={
              <Button variant="secondary" size="small" onClick={reload}>
                Try again
              </Button>
            }
          >
            {loadError.message}
          </Notice>
        ) : current ? (
          <EntryWorkspace
            key={`${date}:${slot}:${generation}`}
            ref={workspaceRef}
            date={date}
            slot={slot}
            initial={current.entries.find((entry) => entry.slot === slot) ?? null}
            today={today}
            autosaveDelayMs={autosaveDelayMs}
            onStatusChange={onStatusChange}
            onSaved={clearBlocked}
            onMoved={(nextDate, nextSlot) => {
              setDate(nextDate);
              setSlot(nextSlot);
              reload();
            }}
            onTrashed={() => {
              setNotice('Entry moved to Trash. You can restore it from Trash for 30 days.');
              focusHeading.current = true;
              reload();
            }}
            onReload={reload}
          />
        ) : (
          <p className="today__loading" aria-busy="true">
            Opening this day…
          </p>
        )}
      </div>
    </div>
  );
}

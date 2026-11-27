// Today: the open journal date, its Morning and Evening entries, and the writing
// workspace. The date opens on today and, while the person has not chosen another
// date, moves on to the new today after midnight as soon as no entry is open (an
// entry that is open keeps its date). Otherwise it changes only through the
// person's navigation. Pending input is saved before moving to another date or
// slot, each slot opens on its saved version, and a failed save keeps the entry
// open instead of losing it.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { CommandError, Entry, Slot } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { findSaver, settleDetachedSavers } from '../../state/autosave';
import { useToday } from '../../state/clock';
import { useFocusMode } from '../../state/focus';
import { useNavigation } from '../../state/navigation';
import { DateHeader } from './DateHeader';
import { EntryWorkspace, type EntryWorkspaceHandle, type FlushOutcome } from './EntryWorkspace';
import { slotTabId, SlotTabs } from './SlotTabs';
import { entryStatus, type EntryStatus } from './status';
import './today.css';
import {MiniTimeline} from '../reading/Timeline';

interface Loaded {
  date: string;
  generation: number;
  entries: Entry[];
}

/** Why the open entry could not be left: its save may still succeed, or only a reload can help. */
type Blocked = Exclude<FlushOutcome, 'saved'>;

const SLOT_ORDER: Record<Slot, number> = { morning: 0, evening: 1 };

/** The date's entries with a version of one of them the journal has just acknowledged. */
function withAcknowledged(loaded: Loaded, entry: Entry): Loaded {
  const known = loaded.entries.find((item) => item.id === entry.id);
  if (known === entry || (known && known.revision > entry.revision)) return loaded;
  // The acknowledged entry replaces its older version and anything listed in its slot.
  const others = loaded.entries.filter(
    (item) => item.id !== entry.id && (entry.date !== loaded.date || item.slot !== entry.slot),
  );
  if (entry.date !== loaded.date) {
    // Moved to another date.
    return others.length === loaded.entries.length ? loaded : { ...loaded, entries: others };
  }
  return { ...loaded, entries: [...others, entry].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]) };
}

function isWriting(panel: HTMLElement | null): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.closest('.ProseMirror') !== null && (panel?.contains(active) ?? false);
}

interface TodayViewProps {
  /** Quiet period before an automatic save; tests shorten it. */
  autosaveDelayMs?: number;
  initialDate?: string;
  initialSlot?: Slot;
}

export function TodayView({ autosaveDelayMs, initialDate, initialSlot }: TodayViewProps = {}) {
  const api = useApi();
  const { today } = useToday();
  const { focusMode } = useFocusMode();
  const { navigate: openView } = useNavigation();
  const panelId = useId();
  const [date, setDate] = useState(initialDate ?? today);
  // True while the open date is today's, reached without choosing another date. Another view
  // opening today's date (Calendar's Edit, Open day…) opens Today as the navigation rail does.
  const [followsToday, setFollowsToday] = useState(!initialDate || initialDate === today);
  const [slot, setSlot] = useState<Slot>(initialSlot ?? 'morning');
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<CommandError | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<Partial<Record<Slot, EntryStatus>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const workspaceRef = useRef<EntryWorkspaceHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusHeading = useRef(false);
  const focusEditor = useRef(false);
  const retryRef = useRef<HTMLButtonElement>(null);

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
  // Today moved on (midnight, or a new time zone) while this date was simply today.
  const stale = followsToday && date !== today;

  useEffect(() => {
    if (!ready) return;
    if (focusHeading.current) {
      focusHeading.current = false;
      headingRef.current?.focus();
    }
    if (focusEditor.current) {
      focusEditor.current = false;
      workspaceRef.current?.focusEditor();
    }
  }, [ready]);

  // The day could not be read after a control that went away asked for it: Try again takes the focus.
  useEffect(() => {
    if (!loadError || !(focusHeading.current || focusEditor.current)) return;
    focusHeading.current = false;
    focusEditor.current = false;
    retryRef.current?.focus();
  }, [loadError]);

  // Nothing is open on a day left over from before midnight: a new entry belongs to
  // today, so the view moves on to it, keeping the slot.
  useEffect(() => {
    if (!stale || !ready || blocked !== null) return;
    const workspace = workspaceRef.current;
    if (!workspace || workspace.hasEntry()) return;
    focusEditor.current = isWriting(panelRef.current);
    setDate(today);
  }, [stale, ready, blocked, today]);

  const onStatusChange = useCallback((changed: Slot, status: EntryStatus) => {
    setLiveStatuses((known) => (known[changed] === status ? known : { ...known, [changed]: status }));
  }, []);

  const onAcknowledged = useCallback((entry: Entry) => {
    setLoaded((known) => (known ? withAcknowledged(known, entry) : known));
  }, []);

  const clearBlocked = useCallback(() => setBlocked(null), []);

  // No status until this date's entries are read, so another date's status never shows.
  const statusFor = (item: Slot): EntryStatus | null =>
    current ? (liveStatuses[item] ?? entryStatus(current.entries.find((entry) => entry.slot === item))) : null;

  /** Saves the open entry, then opens the date and slot; false when the entry has to stay open. */
  async function go(nextDate: string, nextSlot: Slot): Promise<boolean> {
    if (nextDate === date && nextSlot === slot) return true;
    const outcome = (await workspaceRef.current?.flush()) ?? 'saved';
    if (outcome !== 'saved') {
      setBlocked(outcome);
      return false;
    }
    setBlocked(null);
    setNotice(null);
    setDate(nextDate);
    setSlot(nextSlot);
    // Read the date again once the entry just left has settled, so the slot opens on its saved version.
    setGeneration((value) => value + 1);
    return true;
  }

  async function chooseDate(next: string) {
    const follows = next === today;
    if (await go(next, slot)) setFollowsToday(follows);
  }

  function chooseSlot(next: Slot) {
    // An empty slot on a day left over from before midnight would hold a new entry,
    // and a new entry belongs to today.
    const empty =
      current !== null && !current.entries.some((entry) => entry.slot === next) && findSaver(date, next) === undefined;
    void go(stale && empty ? today : date, next);
  }

  function reload() {
    setBlocked(null);
    setGeneration((value) => value + 1);
  }

  /** Reads the day again for a control that goes away meanwhile; the writing then takes the focus. */
  function reloadToWriting() {
    focusEditor.current = true;
    reload();
  }

  return (
    <div className="view today">
      <DateHeader
        date={date}
        today={today}
        compact={focusMode}
        headingRef={headingRef}
        onNavigate={(next) => void chooseDate(next)}
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
      {blocked === 'retry' ? (
        <Notice tone="warning">
          This entry has changes that are not saved yet, so it stays open and nothing is lost. Once it is saved, you
          can move on.
        </Notice>
      ) : null}
      {blocked === 'reload' ? (
        <Notice tone="warning">
          These changes can't be saved, so this entry stays open. Copy any writing you want to keep before you
          reload: reloading shows the saved version without your recent changes.
        </Notice>
      ) : null}

      {focusMode ? null : (
        <SlotTabs
          slot={slot}
          statuses={{ morning: statusFor('morning'), evening: statusFor('evening') }}
          panelId={panelId}
          onSelect={chooseSlot}
        />
      )}

      <div
        ref={panelRef}
        id={panelId}
        role={focusMode ? undefined : 'tabpanel'}
        aria-labelledby={focusMode ? undefined : slotTabId(slot)}
        className="today__panel"
      >
        {loadError ? (
          <Notice
            tone="error"
            actions={
              <Button ref={retryRef} variant="secondary" size="small" onClick={reloadToWriting}>
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
            onAcknowledged={onAcknowledged}
            onMoved={(nextDate, nextSlot) => {
              setFollowsToday(nextDate === today);
              setDate(nextDate);
              setSlot(nextSlot);
              reloadToWriting();
            }}
            onTrashed={() => {
              setNotice('Entry moved to Trash. You can restore it from Trash for 30 days.');
              focusHeading.current = true;
              reload();
            }}
            onReload={reloadToWriting}
          />
        ) : (
          <p className="today__loading" aria-busy="true">
            Opening this day…
          </p>
        )}
      </div>
      {focusMode ? null : <MiniTimeline date={date} onSelect={(next)=>void chooseDate(next)}/>}
    </div>
  );
}

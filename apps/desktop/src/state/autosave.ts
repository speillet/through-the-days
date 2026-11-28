// Progressive autosave for one journal entry. A saver keeps the person's local
// copy, sends at most one save at a time, and reports Saved only once the journal
// has acknowledged every local edit. A failed save keeps all local input for a
// retry. Savers outlive the view that showed them while they still hold unsaved
// input, so closing the window or quitting still waits for them (state/flush.ts)
// and, when their save still fails, opens their date and slot in Today; returning
// to the same date and slot picks them up again.
// Every save sends well-formed text: a lone UTF-16 surrogate becomes U+FFFD.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toCommandError, useApi, type JournalApi } from '../api/client';
import type { CommandError, Entry, Slot } from '../api/types';
import { registerFlusher, type PendingInput } from './flush';

/** Quiet period after the last edit before an automatic save. */
export const AUTOSAVE_DELAY_MS = 700;

/**
 * idle: nothing written yet; pending: edits wait for the quiet period; saving: a save
 * is in flight; saved: every edit is acknowledged; failed: the last save failed and
 * the local input is kept.
 */
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

export interface AutosaveSnapshot {
  /** The person's local copy; null until the first interaction creates the draft. */
  entry: Entry | null;
  /** The entry as the journal last acknowledged it (the saved version); null while nothing is saved. */
  saved: Entry | null;
  state: SaveState;
  /** Why the last save failed; cleared by the next acknowledged save. */
  error: CommandError | null;
  /** Retrying cannot help: the saved entry changed, disappeared or its slot is taken. */
  needsReload: boolean;
}

/** A change to the local entry. Return the same object when nothing changes. */
export type EntryChange = (entry: Entry) => Entry;

const RELOAD_CODES: ReadonlySet<string> = new Set(['conflict', 'notFound', 'occupied']);

/** Refusals of an explicit change (completion, move) that only reloading the saved version can resolve. */
const STALE_CODES: ReadonlySet<string> = new Set(['conflict', 'notFound']);

/** The saved entry changed or disappeared: the saver then fails and offers to reload it. */
export function isStaleRefusal(error: CommandError): boolean {
  return STALE_CODES.has(error.code);
}

const SURROGATE = /[\uD800-\uDFFF]/;
// Without the u flag the pattern sees UTF-16 code units: a valid pair first, else a lone half.
const SURROGATE_UNITS = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

/**
 * Replaces lone UTF-16 surrogates (half of an emoji pasted on its own) with U+FFFD.
 * The native journal cannot read them, so they would make every save of the entry fail.
 */
export function wellFormedText(text: string): string {
  if (!SURROGATE.test(text)) return text;
  return text.replace(SURROGATE_UNITS, (units) => (units.length === 2 ? units : '\uFFFD'));
}

/** The same value with every string well formed; unchanged parts keep their identity. */
export function wellFormed<T>(value: T): T {
  if (typeof value === 'string') return wellFormedText(value) as T;
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item: unknown) => {
      const fixed = wellFormed(item);
      if (fixed !== item) changed = true;
      return fixed;
    });
    return (changed ? items : value) as T;
  }
  if (typeof value === 'object' && value !== null) {
    let changed = false;
    const fields: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
      const fixed = wellFormed(field);
      if (fixed !== field) changed = true;
      fields[key] = fixed;
    }
    return (changed ? fields : value) as T;
  }
  return value;
}

const NOTHING_TO_COMPLETE: CommandError = {
  code: 'completion',
  message: 'Add some writing, a mood score and an energy score before marking this entry complete.',
};

export type SaverApi = Pick<JournalApi, 'saveEntry' | 'trashEntry'>;

export interface EntrySaverOptions {
  api: SaverApi;
  /** The acknowledged entry, or null when the slot has no entry yet. */
  initial: Entry | null;
  /** Builds the draft at the first interaction; nothing is saved before it. */
  create(): Entry;
  delayMs?: number;
}

/** Savers that a view shows, or that still hold unsaved input after their view left. */
const live = new Set<EntrySaver>();

export class EntrySaver {
  private readonly api: SaverApi;
  private readonly create: () => Entry;
  private readonly delayMs: number;
  private entry: Entry | null;
  private saved: Entry | null;
  /** Counts local edits; acknowledgedEdits is the count the journal has acknowledged. */
  private edits = 0;
  private acknowledgedEdits = 0;
  private state: SaveState;
  private error: CommandError | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<unknown> | null = null;
  private draining: Promise<boolean> | null = null;
  private attachments = 0;
  private unregisterFlusher: (() => void) | null = null;
  private discarded = false;
  private readonly listeners = new Set<() => void>();
  private snapshot: AutosaveSnapshot;

  constructor({ api, initial, create, delayMs = AUTOSAVE_DELAY_MS }: EntrySaverOptions) {
    this.api = api;
    this.create = create;
    this.delayMs = delayMs;
    this.entry = initial;
    this.saved = initial;
    this.state = initial ? 'saved' : 'idle';
    this.snapshot = this.buildSnapshot();
  }

  // -- Subscription (useSyncExternalStore) -----------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AutosaveSnapshot => this.snapshot;

  // -- Editing ------------------------------------------------------------------

  /** Applies a local change, creating the draft first if needed, and schedules a save. */
  update = (change: EntryChange): void => {
    if (this.discarded) return;
    const base = this.entry ?? this.create();
    const next = change(base);
    if (next === base) return;
    this.entry = next;
    this.edits += 1;
    this.track();
    if (this.needsReload()) {
      this.emit();
      return;
    }
    // After a failure the failure stays visible until a save succeeds; the next
    // edit still retries quietly.
    if (this.state !== 'failed') this.state = 'pending';
    this.emit();
    this.schedule();
  };

  /** Sends pending input now; resolves true once everything local is acknowledged. */
  flush = (): Promise<boolean> => {
    this.clearTimer();
    if (this.discarded) return Promise.resolve(true);
    this.draining ??= this.drain();
    return this.draining;
  };

  /** An explicit save (⌘S, Try again): shows Saving… even after a failure. */
  saveNow = (): Promise<boolean> => {
    if (!this.discarded && this.isDirty() && !this.needsReload() && this.state !== 'saving') {
      this.state = 'saving';
      this.emit();
    }
    return this.flush();
  };

  /** Requests completion. The journal refuses it unless writing, mood and energy are present. */
  markComplete = async (): Promise<CommandError | null> => {
    if (!(await this.flush())) return this.error;
    if (!this.entry) return NOTHING_TO_COMPLETE;
    return this.commit(
      (entry) => (entry.complete ? entry : { ...entry, complete: true }),
      (entry) => ({ ...entry, complete: false }),
    );
  };

  markDraft = async (): Promise<CommandError | null> => {
    if (!(await this.flush())) return this.error;
    return this.commit(
      (entry) => (entry.complete ? { ...entry, complete: false } : entry),
      (entry) => ({ ...entry, complete: true }),
    );
  };

  /** Moves the entry to another journal date or slot; an occupied slot is refused untouched. */
  move = async (date: string, slot: Slot): Promise<CommandError | null> => {
    if (!(await this.flush())) return this.error;
    const origin = this.entry;
    if (!origin) return null;
    return this.commit(
      (entry) => (entry.date === date && entry.slot === slot ? entry : { ...entry, date, slot }),
      (entry) => ({ ...entry, date: origin.date, slot: origin.slot }),
    );
  };

  /** Saves pending input, then moves the entry to Trash and lets this saver go. */
  trash = async (): Promise<CommandError | null> => {
    if (!(await this.flush())) return this.error;
    const entry = this.entry;
    if (entry && entry.revision > 0) {
      try {
        await this.api.trashEntry(entry.id, entry.revision);
      } catch (caught) {
        return toCommandError(caught);
      }
    }
    this.discard();
    return null;
  };

  /** Drops local input and stops saving, for example before reloading the saved version. */
  discard = (): void => {
    this.discarded = true;
    this.clearTimer();
    this.untrack();
  };

  // -- Lifecycle -------------------------------------------------------------------

  /** A view starts showing this saver; the returned function is called when it stops. */
  attach = (): (() => void) => {
    this.attachments += 1;
    this.track();
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      this.attachments -= 1;
      // Leaving the view saves at once; the saver stays registered until acknowledged.
      if (this.attachments === 0) void this.flush();
    };
  };

  /** Whether this saver holds the given journal date and slot. */
  holds(date: string, slot: Slot): boolean {
    return !this.discarded && this.entry !== null && this.entry.date === date && this.entry.slot === slot;
  }

  hasPending(): boolean {
    return this.inFlight !== null || this.isDirty();
  }

  /** The date and slot of the input that waits for acknowledgment, or null while none does. */
  pendingInput(): PendingInput | null {
    if (!this.hasPending() || !this.entry) return null;
    return { kind: 'entry', date: this.entry.date, slot: this.entry.slot };
  }

  /** Lets a saver that no view shows finish (or fail) its save. */
  settleIfDetached(): Promise<unknown> {
    return this.attachments === 0 ? this.flush() : Promise.resolve();
  }

  // -- Internals ---------------------------------------------------------------------

  private isDirty(): boolean {
    return !this.discarded && this.entry !== null && this.edits !== this.acknowledgedEdits;
  }

  private needsReload(): boolean {
    return this.error !== null && RELOAD_CODES.has(this.error.code);
  }

  private schedule(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async drain(): Promise<boolean> {
    try {
      // Never settle synchronously: flush() must store this promise before the
      // finally clause below clears it, or later flushes would reuse a settled one.
      await Promise.resolve();
      for (;;) {
        if (this.inFlight) {
          await this.inFlight;
          continue;
        }
        if (!this.isDirty()) {
          // Nothing left to save and no view shows it: stop holding it.
          if (this.attachments === 0) this.untrack();
          return true;
        }
        if (this.needsReload()) return false;
        if (!(await this.saveOnce())) return false;
      }
    } finally {
      // Cleared in the same turn as the final check, so a later edit starts a new drain.
      this.draining = null;
    }
  }

  private async saveOnce(): Promise<boolean> {
    const sent = this.entry as Entry;
    const edits = this.edits;
    if (this.state !== 'failed') {
      this.state = 'saving';
      this.emit();
    }
    const request = this.api.saveEntry(wellFormed(sent));
    this.inFlight = request.catch(() => undefined);
    try {
      this.acknowledge(await request, sent, edits);
      return true;
    } catch (caught) {
      this.error = toCommandError(caught);
      this.state = 'failed';
      this.emit();
      return false;
    } finally {
      this.inFlight = null;
    }
  }

  /** Adopts the acknowledged revision; edits made during the save stay local and pending. */
  private acknowledge(saved: Entry, sent: Entry, edits: number): void {
    this.acknowledgedEdits = edits;
    this.saved = saved;
    const local = this.entry as Entry;
    if (this.edits === edits) {
      // The journal may have returned a completed entry to draft (its writing was cleared).
      this.entry = saved;
    } else {
      this.entry = {
        ...local,
        revision: saved.revision,
        complete: local.complete === sent.complete ? saved.complete : local.complete,
      };
    }
    this.error = null;
    this.state = this.isDirty() ? 'pending' : 'saved';
    this.emit();
  }

  /**
   * Saves one explicit change on its own (completion, a new date or slot). A refusal
   * rolls back only that change and returns the English reason; other edits are kept.
   * When the saved entry changed or disappeared meanwhile, the saver fails like a
   * refused save, so the page offers to reload the saved version.
   */
  private async commit(apply: EntryChange, rollback: EntryChange): Promise<CommandError | null> {
    const base = this.entry;
    if (!base || this.discarded) return null;
    const next = apply(base);
    if (next === base) return null;
    this.clearTimer();
    this.entry = next;
    this.edits += 1;
    const edits = this.edits;
    this.state = 'saving';
    this.emit();
    const request = this.api.saveEntry(wellFormed(next));
    this.inFlight = request.catch(() => undefined);
    try {
      this.acknowledge(await request, next, edits);
      if (this.isDirty()) this.schedule();
      return null;
    } catch (caught) {
      const error = toCommandError(caught);
      this.entry = rollback(this.entry as Entry);
      // Nothing else changed meanwhile: the local copy matches the saved entry again.
      const unchanged = this.edits === edits;
      if (unchanged) this.acknowledgedEdits = edits;
      if (isStaleRefusal(error)) {
        this.error = error;
        this.state = 'failed';
        this.emit();
      } else if (unchanged) {
        this.state = 'saved';
        this.emit();
      } else {
        this.state = 'pending';
        this.emit();
        this.schedule();
      }
      return error;
    } finally {
      this.inFlight = null;
    }
  }

  private track(): void {
    if (this.discarded) return;
    live.add(this);
    this.unregisterFlusher ??= registerFlusher({
      flush: () => this.flush(),
      hasPending: () => this.hasPending(),
      pendingInput: () => this.pendingInput(),
    });
  }

  private untrack(): void {
    live.delete(this);
    this.unregisterFlusher?.();
    this.unregisterFlusher = null;
  }

  private buildSnapshot(): AutosaveSnapshot {
    return {
      entry: this.entry,
      saved: this.saved,
      state: this.state,
      error: this.error,
      needsReload: this.needsReload(),
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
}

/** The saver already holding this date and slot, for example one whose save failed after its view left. */
export function findSaver(date: string, slot: Slot): EntrySaver | undefined {
  for (const saver of live) if (saver.holds(date, slot)) return saver;
  return undefined;
}

/** Waits until savers that no view shows have saved (or failed), so a fresh read is current. */
export async function settleDetachedSavers(): Promise<void> {
  await Promise.all(Array.from(live, (saver) => saver.settleIfDetached()));
}

/** Drops every saver, for example after the whole journal was replaced. */
export function discardAllSavers(): void {
  for (const saver of Array.from(live)) saver.discard();
}

export interface UseEntryAutosaveOptions {
  date: string;
  slot: Slot;
  /** The saved entry for this date and slot, or null. Ignored when a saver already holds them. */
  initial: Entry | null;
  create(): Entry;
  delayMs?: number;
}

export interface EntryAutosave extends AutosaveSnapshot {
  /** The saver's latest snapshot, read at call time (event handlers, imperative handles). */
  current(): AutosaveSnapshot;
  update(change: EntryChange): void;
  flush(): Promise<boolean>;
  saveNow(): Promise<boolean>;
  markComplete(): Promise<CommandError | null>;
  markDraft(): Promise<CommandError | null>;
  move(date: string, slot: Slot): Promise<CommandError | null>;
  trash(): Promise<CommandError | null>;
  discard(): void;
}

/** Autosave for the entry of one date and slot. Key the calling component by date and slot. */
export function useEntryAutosave({ date, slot, initial, create, delayMs }: UseEntryAutosaveOptions): EntryAutosave {
  const api = useApi();
  const createRef = useRef(create);
  useLayoutEffect(() => {
    createRef.current = create;
  });
  const [saver] = useState(
    () => findSaver(date, slot) ?? new EntrySaver({ api, initial, create: () => createRef.current(), delayMs }),
  );
  useEffect(() => saver.attach(), [saver]);
  const snapshot = useSyncExternalStore(saver.subscribe, saver.getSnapshot, saver.getSnapshot);
  return useMemo(
    () => ({
      ...snapshot,
      current: saver.getSnapshot,
      update: saver.update,
      flush: saver.flush,
      saveNow: saver.saveNow,
      markComplete: saver.markComplete,
      markDraft: saver.markDraft,
      move: saver.move,
      trash: saver.trash,
      discard: saver.discard,
    }),
    [snapshot, saver],
  );
}

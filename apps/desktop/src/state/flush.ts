// Registry of unsaved input. Each editor registers how to flush it, so closing the
// window or quitting the app can wait for pending saves first. Input that still
// cannot be saved says where it is shown, so a refused close, quit, restore or
// erasure can open it rather than leave it out of sight.

import type { Slot } from '../api/types';

export type FlushFn = () => unknown;

/** Unsaved input, by the place that shows it: an entry in Today, or a week's notes in Weekly Review. */
export type PendingInput = { kind: 'entry'; date: string; slot: Slot } | { kind: 'weeklyNotes'; week: string };

export interface Flusher {
  /** Sends pending input now; may return a promise that settles when acknowledged or failed. */
  flush: FlushFn;
  /** True while input waits for acknowledgment. Without it the flusher always counts as pending. */
  hasPending?: () => boolean;
  /** The input that waits for acknowledgment, or null while none does. */
  pendingInput?: () => PendingInput | null;
}

/** Keep the caller responsive so it can recheck pending input; a timeout never approves exit. */
const FLUSH_TIMEOUT_MS = 8_000;

const flushers = new Set<Flusher>();

/** Opens the view that shows pending input, with the English reason it is shown; set while the workspace is open. */
export type PendingInputOpener = (input: PendingInput, notice?: string) => void;

let opener: PendingInputOpener | null = null;

/** Registers an editor's flusher; call the returned function on unmount. */
export function registerFlusher(flusher: Flusher | FlushFn): () => void {
  const entry: Flusher = typeof flusher === 'function' ? { flush: flusher } : flusher;
  flushers.add(entry);
  return () => {
    flushers.delete(entry);
  };
}

export function hasPending(): boolean {
  for (const flusher of flushers) {
    if (!flusher.hasPending) return true;
    try {
      if (flusher.hasPending()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** Flushes every registered editor and settles when all finish, or after the timeout. */
export async function flushAll(timeoutMs: number = FLUSH_TIMEOUT_MS): Promise<void> {
  const work = Promise.allSettled(Array.from(flushers, (flusher) => Promise.resolve().then(flusher.flush)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The open workspace says how pending input is opened; call the returned function when it closes. */
export function setPendingInputOpener(open: PendingInputOpener): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/**
 * Opens the first pending input that says where it is shown, once a close, quit,
 * restore or erasure was refused for it; `notice` says why it is shown. False when
 * nothing could be opened, for example while no workspace is open: the caller then
 * explains the refusal itself.
 */
export function openPendingInput(notice?: string): boolean {
  const open = opener;
  if (!open) return false;
  for (const flusher of flushers) {
    try {
      const input = flusher.pendingInput?.() ?? null;
      if (input) {
        open(input, notice);
        return true;
      }
    } catch {
      // Input that cannot be located or opened stays pending; the caller explains the refusal.
    }
  }
  return false;
}

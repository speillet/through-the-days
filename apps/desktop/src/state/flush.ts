// Registry of unsaved input. Each editor registers how to flush it, so closing the
// window or quitting the app can wait for pending saves first.

export type FlushFn = () => unknown;

export interface Flusher {
  /** Sends pending input now; may return a promise that settles when acknowledged or failed. */
  flush: FlushFn;
  /** True while input waits for acknowledgment. Without it the flusher always counts as pending. */
  hasPending?: () => boolean;
}

/** Keep the caller responsive so it can recheck pending input; a timeout never approves exit. */
const FLUSH_TIMEOUT_MS = 8_000;

const flushers = new Set<Flusher>();

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

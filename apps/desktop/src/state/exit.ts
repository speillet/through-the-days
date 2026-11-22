// Native window close and app quit both wait for pending saves (state/flush.ts).
//
// Known limit: a quit that macOS starts itself (Dock, app switcher, logout, shutdown)
// never sends the flush request. To keep that window short, pending input is also
// saved as soon as the window loses focus or the page is hidden, which happens
// before any of those quits.

import type { JournalApi } from '../api/client';
import { flushAll, hasPending } from './flush';

export interface CloseRequest {
  preventDefault(): void;
}

/** The part of Tauri's Window used here; getCurrentWindow() satisfies it. */
export interface ClosableWindow {
  onCloseRequested(handler: (event: CloseRequest) => void | Promise<void>): Promise<() => void>;
  destroy(): Promise<void>;
}

/** Where focus and visibility changes are observed; the real window and document by default. */
export interface PageEvents {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
}

/**
 * Saves pending input when the window loses focus or the page is hidden. Returns a
 * function that stops listening.
 */
export function installBackgroundFlush(page: PageEvents = { window, document }): () => void {
  const flushPending = () => {
    if (hasPending()) void flushAll();
  };
  const onVisibilityChange = () => {
    if (page.document.visibilityState === 'hidden') flushPending();
  };
  page.window.addEventListener('blur', flushPending);
  page.document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    page.window.removeEventListener('blur', flushPending);
    page.document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

/**
 * Close request: when input is pending, keep the window open, flush, then close.
 * If a save still fails, keep the window and its unsaved writing open for retry.
 * Quit request (app://flush-request): confirm only after every save succeeds.
 * Losing focus or being hidden: flush (see installBackgroundFlush).
 */
export function installExitFlush(
  api: Pick<JournalApi, 'onFlushRequest' | 'confirmExit'> & Partial<Pick<JournalApi, 'cancelExit'>>,
  appWindow: ClosableWindow,
  page?: PageEvents,
): () => void {
  let disposed = false;
  let stopCloseListener: (() => void) | null = null;

  appWindow
    .onCloseRequested(async (event) => {
      if (!hasPending()) {
        return;
      }
      event.preventDefault();
      await flushAll();
      if (hasPending()) return;
      await appWindow.destroy();
    })
    .then(
      (stop) => {
        if (disposed) stop();
        else stopCloseListener = stop;
      },
      () => {
        // Without the listener the window closes normally.
      },
    );

  const stopFlushListener = api.onFlushRequest(async () => {
    await flushAll();
    if (hasPending()) {
      await api.cancelExit?.();
      return;
    }
    await api.confirmExit();
  });

  const stopBackgroundFlush = installBackgroundFlush(page);

  return () => {
    disposed = true;
    stopCloseListener?.();
    stopFlushListener();
    stopBackgroundFlush();
  };
}

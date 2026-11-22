// Native window close and app quit both wait for pending saves (state/flush.ts).

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

/**
 * Close request: when input is pending, keep the window open, flush, then close.
 * If a save still fails, the first close is cancelled so "Couldn't save" stays on
 * screen with the text intact; asking to close again closes anyway.
 * Quit request (app://flush-request): flush, then confirm the exit.
 */
export function installExitFlush(
  api: Pick<JournalApi, 'onFlushRequest' | 'confirmExit'>,
  appWindow: ClosableWindow,
): () => void {
  let disposed = false;
  let stopCloseListener: (() => void) | null = null;
  let keptOpenAfterFailure = false;

  appWindow
    .onCloseRequested(async (event) => {
      if (!hasPending()) {
        keptOpenAfterFailure = false;
        return;
      }
      event.preventDefault();
      await flushAll();
      if (hasPending() && !keptOpenAfterFailure) {
        keptOpenAfterFailure = true;
        return;
      }
      keptOpenAfterFailure = false;
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
    await api.confirmExit();
  });

  return () => {
    disposed = true;
    stopCloseListener?.();
    stopFlushListener();
  };
}

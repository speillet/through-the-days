import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloseRequest, ClosableWindow } from './exit';
import { installBackgroundFlush, installExitFlush } from './exit';
import { registerFlusher } from './flush';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function fakeWindow() {
  let handler: ((event: CloseRequest) => void | Promise<void>) | null = null;
  const destroy = vi.fn(async () => {});
  const appWindow: ClosableWindow = {
    onCloseRequested: async (next) => {
      handler = next;
      return () => {
        handler = null;
      };
    },
    destroy,
  };
  async function requestClose() {
    const event = { prevented: false, preventDefault() {
      this.prevented = true;
    } };
    await handler?.(event);
    return event.prevented;
  }
  return { appWindow, destroy, requestClose, isListening: () => handler !== null };
}

function fakeApi() {
  let onRequest: (() => void | Promise<void>) | null = null;
  const confirmExit = vi.fn(async () => {});
  return {
    api: {
      onFlushRequest: (callback: () => void | Promise<void>) => {
        onRequest = callback;
        return () => {
          onRequest = null;
        };
      },
      confirmExit,
    },
    confirmExit,
    requestQuit: () => onRequest?.(),
    isListening: () => onRequest !== null,
  };
}

function install() {
  const win = fakeWindow();
  const native = fakeApi();
  const stop = installExitFlush(native.api, win.appWindow);
  cleanups.push(stop);
  return { win, native, stop };
}

describe('exit flushing', () => {
  it('lets the window close normally when nothing is pending', async () => {
    const { win } = install();
    await vi.waitFor(() => expect(win.isListening()).toBe(true));
    expect(await win.requestClose()).toBe(false);
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it('flushes pending input before closing the window', async () => {
    const { win } = install();
    await vi.waitFor(() => expect(win.isListening()).toBe(true));
    let pending = true;
    const flush = vi.fn(async () => {
      pending = false;
    });
    cleanups.push(registerFlusher({ flush, hasPending: () => pending }));
    expect(await win.requestClose()).toBe(true);
    expect(flush).toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps unsaved writing open after every failed close attempt', async () => {
    const { win } = install();
    await vi.waitFor(() => expect(win.isListening()).toBe(true));
    cleanups.push(registerFlusher({ flush: async () => {}, hasPending: () => true }));
    await win.requestClose();
    expect(win.destroy).not.toHaveBeenCalled();
    await win.requestClose();
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it('does not confirm quitting while a failed save still has pending writing', async () => {
    const { native } = install();
    cleanups.push(registerFlusher({ flush: async () => {}, hasPending: () => true }));
    await native.requestQuit();
    expect(native.confirmExit).not.toHaveBeenCalled();
  });

  it('flushes before confirming a quit request', async () => {
    const { native } = install();
    const order: string[] = [];
    let pending = true;
    cleanups.push(registerFlusher({ flush: async () => { order.push('flushed'); pending = false; }, hasPending: () => pending }));
    native.confirmExit.mockImplementation(async () => {
      order.push('confirmed');
    });
    await native.requestQuit();
    expect(order).toEqual(['flushed', 'confirmed']);
  });

  it('stops listening when uninstalled', async () => {
    const { win, native, stop } = install();
    await vi.waitFor(() => expect(win.isListening()).toBe(true));
    stop();
    expect(win.isListening()).toBe(false);
    expect(native.isListening()).toBe(false);
  });
});

describe('saving when the app goes to the background', () => {
  function pendingFlusher() {
    let pending = true;
    const flush = vi.fn(async () => {
      pending = false;
    });
    cleanups.push(registerFlusher({ flush, hasPending: () => pending }));
    return flush;
  }

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  }

  /** Lets the flushes started by an event run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });

  it('saves pending input as soon as the window loses focus', async () => {
    install();
    const flush = pendingFlusher();
    fireEvent.blur(window);
    await settle();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('saves pending input when the page is hidden, not when it is shown again', async () => {
    install();
    const flush = pendingFlusher();
    setVisibility('visible');
    fireEvent(document, new Event('visibilitychange'));
    await settle();
    expect(flush).not.toHaveBeenCalled();
    setVisibility('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await settle();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no input is pending, and stops listening when uninstalled', async () => {
    const stop = installBackgroundFlush();
    const idle = vi.fn();
    cleanups.push(registerFlusher({ flush: idle, hasPending: () => false }));
    fireEvent.blur(window);
    await settle();
    expect(idle).not.toHaveBeenCalled();
    stop();
    const flush = pendingFlusher();
    fireEvent.blur(window);
    await settle();
    expect(flush).not.toHaveBeenCalled();
  });

  it('stops the background saves when the exit flushing is uninstalled', async () => {
    const { stop } = install();
    stop();
    const flush = pendingFlusher();
    fireEvent.blur(window);
    await settle();
    expect(flush).not.toHaveBeenCalled();
  });
});

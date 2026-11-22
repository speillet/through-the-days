import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloseRequest, ClosableWindow } from './exit';
import { installExitFlush } from './exit';
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

  it('keeps the window open once when saving still fails, then closes on the next request', async () => {
    const { win } = install();
    await vi.waitFor(() => expect(win.isListening()).toBe(true));
    cleanups.push(registerFlusher({ flush: async () => {}, hasPending: () => true }));
    await win.requestClose();
    expect(win.destroy).not.toHaveBeenCalled();
    await win.requestClose();
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });

  it('flushes before confirming a quit request', async () => {
    const { native } = install();
    const order: string[] = [];
    cleanups.push(registerFlusher(async () => order.push('flushed')));
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

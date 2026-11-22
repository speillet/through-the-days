import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushAll, hasPending, registerFlusher } from './flush';

const unregister: Array<() => void> = [];

afterEach(() => {
  while (unregister.length) unregister.pop()?.();
  vi.useRealTimers();
});

function register(...args: Parameters<typeof registerFlusher>) {
  const stop = registerFlusher(...args);
  unregister.push(stop);
  return stop;
}

describe('pending-save registry', () => {
  it('reports pending input only while a flusher says so', () => {
    let pending = false;
    register({ flush: () => {}, hasPending: () => pending });
    expect(hasPending()).toBe(false);
    pending = true;
    expect(hasPending()).toBe(true);
  });

  it('counts a flusher without a pending check as pending, until unregistered', () => {
    const stop = register(() => {});
    expect(hasPending()).toBe(true);
    stop();
    expect(hasPending()).toBe(false);
  });

  it('flushes every registered editor and waits for them', async () => {
    const order: string[] = [];
    register(async () => {
      await Promise.resolve();
      order.push('first');
    });
    register({ flush: () => order.push('second'), hasPending: () => true });
    await flushAll();
    expect(order.sort()).toEqual(['first', 'second']);
  });

  it('still settles when one flush fails', async () => {
    const succeeded = vi.fn();
    register(() => Promise.reject(new Error('Synthetic disk error')));
    register(succeeded);
    await expect(flushAll()).resolves.toBeUndefined();
    expect(succeeded).toHaveBeenCalled();
  });

  it('gives up waiting after the timeout so a close cannot hang', async () => {
    vi.useFakeTimers();
    register(() => new Promise(() => {}));
    const settled = vi.fn();
    void flushAll(1_000).then(settled);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalled();
  });
});

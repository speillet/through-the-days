import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/client';
import { createTestApi, createTestClock } from '../test/render';
import { TodayProvider, useToday } from './clock';
import { PreferencesProvider, usePreferences } from './preferences';

afterEach(() => {
  vi.useRealTimers();
});

function setup(start: Date) {
  const clock = createTestClock(start);
  const api = createTestApi({ now: clock.now });
  const controls: { changeTimeZone?: (zone: string) => Promise<boolean> } = {};
  function Probe() {
    const { today } = useToday();
    return <p>Today is {today}</p>;
  }
  function Updater() {
    const { update } = usePreferences();
    controls.changeTimeZone = (zone) => update({ timeZone: zone });
    return null;
  }
  render(
    <ApiProvider api={api}>
      <PreferencesProvider>
        <TodayProvider intervalMs={60_000}>
          <Updater />
          <Probe />
        </TodayProvider>
      </PreferencesProvider>
    </ApiProvider>,
  );
  return { set: clock.set, controls };
}

/**
 * Lets the journal answer while timeouts are simulated, without moving the simulated
 * clock. (Testing Library's find queries wait on a timeout, which would never run.)
 */
async function settle() {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(() => vi.advanceTimersByTimeAsync(0));
  }
}

describe('TodayProvider', () => {
  it('shows today in the journal time zone', async () => {
    setup(new Date('2026-11-22T22:30:00Z')); // 23:30 in Paris
    expect(await screen.findByText('Today is 2026-11-22')).toBeInTheDocument();
  });

  it('renders nothing until the journal gives its date, so no view starts from a guess', async () => {
    let answer: (date: string) => void = () => {};
    const api = createTestApi();
    vi.spyOn(api, 'today').mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    function Probe() {
      return <p>Today is {useToday().today}</p>;
    }
    render(
      <ApiProvider api={api}>
        <PreferencesProvider>
          <TodayProvider fallback={<p>Waiting for the journal</p>}>
            <Probe />
          </TodayProvider>
        </PreferencesProvider>
      </ApiProvider>,
    );
    expect(await screen.findByText('Waiting for the journal')).toBeInTheDocument();
    act(() => answer('2031-05-04'));
    expect(await screen.findByText('Today is 2031-05-04')).toBeInTheDocument();
  });

  it('falls back to the local clock in the journal time zone if the first answer fails', async () => {
    const api = createTestApi();
    vi.spyOn(api, 'today').mockRejectedValue({ code: 'storage', message: 'Synthetic failure.' });
    function Probe() {
      return <p>Today is {useToday().today}</p>;
    }
    render(
      <ApiProvider api={api}>
        <PreferencesProvider>
          <TodayProvider>
            <Probe />
          </TodayProvider>
        </PreferencesProvider>
      </ApiProvider>,
    );
    expect(await screen.findByText(/^Today is \d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
  });

  it('moves to the next date every minute while the app stays open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const clock = setup(new Date('2026-11-22T22:59:30Z'));
    expect(await screen.findByText('Today is 2026-11-22')).toBeInTheDocument();
    clock.set(new Date('2026-11-22T23:00:30Z')); // 00:00:30 in Paris
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('Today is 2026-11-23')).toBeInTheDocument();
  });

  it('moves to the next date at midnight in the journal time zone, without waiting for the minute timer', async () => {
    // The Mac's clock and the journal's agree; only timeouts and the clock are simulated.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-11-22T22:59:50Z')); // 23:59:50 in Paris
    const clock = setup(new Date('2026-11-22T22:59:50Z'));
    await settle();
    expect(screen.getByText('Today is 2026-11-22')).toBeInTheDocument();
    clock.set(new Date('2026-11-22T23:00:00Z'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(screen.getByText('Today is 2026-11-22')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('Today is 2026-11-23')).toBeInTheDocument();
  });

  it('still moves on at midnight on the day the clocks go forward', async () => {
    // Paris springs forward on Sunday 29 March 2026, so that day lasts 23 hours.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-03-28T23:00:05Z')); // 00:00:05 on Sunday in Paris
    const clock = setup(new Date('2026-03-28T23:00:05Z'));
    await settle();
    expect(screen.getByText('Today is 2026-03-29')).toBeInTheDocument();
    clock.set(new Date('2026-03-29T22:00:00Z')); // Midnight on Monday in Paris
    await act(async () => {
      await vi.advanceTimersByTimeAsync(22 * 3_600_000 + 59 * 60_000 + 54_999);
    });
    expect(screen.getByText('Today is 2026-03-29')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('Today is 2026-03-30')).toBeInTheDocument();
  });

  it('refreshes when the window regains focus', async () => {
    const clock = setup(new Date('2026-11-22T12:00:00Z'));
    await screen.findByText('Today is 2026-11-22');
    clock.set(new Date('2026-11-23T12:00:00Z'));
    fireEvent.focus(window);
    expect(await screen.findByText('Today is 2026-11-23')).toBeInTheDocument();
  });

  it('refreshes when the page is shown again without the window regaining focus, as after the Mac wakes', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const clock = setup(new Date('2026-11-22T21:00:00Z')); // 22:00 in Paris
    await screen.findByText('Today is 2026-11-22');
    visibility.mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    clock.set(new Date('2026-11-23T06:00:00Z')); // 07:00 the next morning
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(await screen.findByText('Today is 2026-11-23')).toBeInTheDocument();
  });

  it('follows a change of journal time zone', async () => {
    const clock = setup(new Date('2026-11-22T12:30:00Z')); // 13:30 Paris, 01:30 next day in Auckland
    await screen.findByText('Today is 2026-11-22');
    await act(async () => {
      await clock.controls.changeTimeZone?.('Pacific/Auckland');
    });
    expect(await screen.findByText('Today is 2026-11-23')).toBeInTheDocument();
  });
});

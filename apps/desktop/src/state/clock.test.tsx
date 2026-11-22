import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/client';
import { createMemoryApi, createMemoryStorage } from '../api/memory';
import { TodayProvider, useToday } from './clock';
import { PreferencesProvider, usePreferences } from './preferences';

afterEach(() => {
  vi.useRealTimers();
});

function setup(start: Date) {
  let now = start;
  const api = createMemoryApi({ storage: createMemoryStorage(), now: () => now });
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
  return {
    setNow(next: Date) {
      now = next;
    },
    controls,
  };
}

describe('TodayProvider', () => {
  it('shows today in the journal time zone', async () => {
    setup(new Date('2026-11-22T22:30:00Z')); // 23:30 in Paris
    expect(await screen.findByText('Today is 2026-11-22')).toBeInTheDocument();
  });

  it('renders nothing until the journal gives its date, so no view starts from a guess', async () => {
    let answer: (date: string) => void = () => {};
    const api = createMemoryApi({ storage: createMemoryStorage() });
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
    const api = createMemoryApi({ storage: createMemoryStorage() });
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
    clock.setNow(new Date('2026-11-22T23:00:30Z')); // 00:00:30 in Paris
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('Today is 2026-11-23')).toBeInTheDocument();
  });

  it('refreshes when the window regains focus', async () => {
    const clock = setup(new Date('2026-11-22T12:00:00Z'));
    await screen.findByText('Today is 2026-11-22');
    clock.setNow(new Date('2026-11-23T12:00:00Z'));
    fireEvent.focus(window);
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

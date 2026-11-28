// Test helpers: a fresh synthetic journal per test and the workspace providers.

import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ApiProvider, type JournalApi } from '../api/client';
import { createMemoryApi, createMemoryStorage, type MemoryApiOptions } from '../api/memory';
import { BackupProvider } from '../state/backup';
import { TodayProvider } from '../state/clock';
import { FocusModeProvider } from '../state/focus';
import { NavigationProvider, type View } from '../state/navigation';
import { PreferencesProvider } from '../state/preferences';
import { StartupProvider } from '../state/startup';

/** Sunday 22 November 2026, 10:00 in Europe/Paris (the default journal time zone). */
export const TEST_NOW = new Date('2026-11-22T09:00:00Z');

/** A memory journal with private storage and a fixed clock unless overridden. */
export function createTestApi(options: MemoryApiOptions = {}): JournalApi {
  return createMemoryApi({ storage: createMemoryStorage(), now: () => TEST_NOW, ...options });
}

const DAY_MS = 86_400_000;

/** A clock a test moves by hand: give `now` to the journal, then `set` or `advanceDays`. */
export function createTestClock(start: Date = TEST_NOW) {
  let current = start;
  return {
    now: () => current,
    set(next: Date) {
      current = next;
    },
    advanceDays(days: number) {
      current = new Date(current.getTime() + days * DAY_MS);
    },
    /** Whole seconds since the Unix epoch, as the journal stores times. */
    unix: () => Math.floor(current.getTime() / 1000),
  };
}

export interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  api?: JournalApi;
  initialView?: View;
}

/**
 * Renders UI inside the same providers as the open workspace. Children appear once
 * preferences have loaded, so query them with findBy… first.
 */
export function renderWithProviders(ui: ReactElement, options: ProviderRenderOptions = {}) {
  const { api = createTestApi(), initialView = 'today', ...renderOptions } = options;
  function Wrapper({ children }: { children?: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <StartupProvider>
          <NavigationProvider initialView={initialView}>
            <PreferencesProvider>
              <TodayProvider>
                <BackupProvider>
                  <FocusModeProvider>{children}</FocusModeProvider>
                </BackupProvider>
              </TodayProvider>
            </PreferencesProvider>
          </NavigationProvider>
        </StartupProvider>
      </ApiProvider>
    );
  }
  return { api, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

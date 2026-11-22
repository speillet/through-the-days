import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider, type JournalApi } from '../api/client';
import { createMemoryApi, createMemoryStorage, ERROR_MESSAGES } from '../api/memory';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import { applyAppearance, restoreCachedAppearance } from './appearance';
import { PreferencesProvider, usePreferences, type PreferencesContextValue } from './preferences';

function renderPreferences(api: JournalApi) {
  const current: { value: PreferencesContextValue | null } = { value: null };
  function Probe() {
    current.value = usePreferences();
    return <p>Theme: {current.value.preferences.theme}</p>;
  }
  render(
    <ApiProvider api={api}>
      <PreferencesProvider fallback={<p>Loading preferences</p>}>
        <Probe />
      </PreferencesProvider>
    </ApiProvider>,
  );
  return current;
}

const html = document.documentElement;

describe('PreferencesProvider', () => {
  it('waits for the journal’s preferences before rendering', async () => {
    const current = renderPreferences(createMemoryApi({ storage: createMemoryStorage() }));
    expect(screen.getByText('Loading preferences')).toBeInTheDocument();
    expect(await screen.findByText('Theme: system')).toBeInTheDocument();
    expect(current.value?.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('persists an update and exposes only the acknowledged value', async () => {
    const storage = createMemoryStorage();
    const current = renderPreferences(createMemoryApi({ storage }));
    await screen.findByText('Theme: system');
    let saved = false;
    await act(async () => {
      saved = (await current.value?.update({ theme: 'dark' })) ?? false;
    });
    expect(saved).toBe(true);
    expect(screen.getByText('Theme: dark')).toBeInTheDocument();
    await expect(createMemoryApi({ storage }).getPreferences()).resolves.toMatchObject({ theme: 'dark' });
  });

  it('applies quick successive changes one after another without losing either', async () => {
    const storage = createMemoryStorage();
    const current = renderPreferences(createMemoryApi({ storage }));
    await screen.findByText('Theme: system');
    await act(async () => {
      await Promise.all([current.value?.update({ gentle: true }), current.value?.update({ showWordCount: true })]);
    });
    expect(current.value?.preferences).toMatchObject({ gentle: true, showWordCount: true });
    await expect(createMemoryApi({ storage }).getPreferences()).resolves.toMatchObject({
      gentle: true,
      showWordCount: true,
    });
  });

  it('keeps the previous value and reports an English error when saving fails', async () => {
    const current = renderPreferences(createMemoryApi({ storage: createMemoryStorage() }));
    await screen.findByText('Theme: system');
    let saved = true;
    await act(async () => {
      saved = (await current.value?.update({ timeZone: 'Atlantis/Capital' })) ?? true;
    });
    expect(saved).toBe(false);
    expect(current.value?.preferences.timeZone).toBe('Europe/Paris');
    expect(current.value?.error).toEqual({ code: 'date', message: ERROR_MESSAGES.date });
    act(() => current.value?.clearError());
    expect(current.value?.error).toBeNull();
  });

  it('falls back to defaults, still rendering, when preferences cannot be read', async () => {
    const api = createMemoryApi({ storage: createMemoryStorage() });
    vi.spyOn(api, 'getPreferences').mockRejectedValue({ code: 'storage', message: ERROR_MESSAGES.storage });
    const current = renderPreferences(api);
    expect(await screen.findByText('Theme: system')).toBeInTheDocument();
    expect(current.value?.error?.code).toBe('storage');
  });

  it('applies the theme and reduced-motion overrides to the document', async () => {
    const current = renderPreferences(createMemoryApi({ storage: createMemoryStorage() }));
    await screen.findByText('Theme: system');
    expect(html).not.toHaveAttribute('data-theme');
    await act(async () => {
      await current.value?.update({ theme: 'light', reduceMotion: true });
    });
    expect(html).toHaveAttribute('data-theme', 'light');
    expect(html).toHaveAttribute('data-reduce-motion', 'true');
    await act(async () => {
      await current.value?.update({ theme: 'system', reduceMotion: false });
    });
    await waitFor(() => expect(html).not.toHaveAttribute('data-theme'));
    expect(html).not.toHaveAttribute('data-reduce-motion');
  });

  it('exposes Gentle view through the shared visibility rules', async () => {
    const current = renderPreferences(createMemoryApi({ storage: createMemoryStorage() }));
    await screen.findByText('Theme: system');
    await act(async () => {
      await current.value?.update({ gentle: true });
    });
    expect(current.value?.visibility).toMatchObject({ scores: false, durations: false, completionPrompts: false });
    expect(current.value?.preferences.showScores).toBe(true);
  });
});

describe('cached appearance', () => {
  it('restores the last theme at launch before the journal answers', () => {
    applyAppearance({ theme: 'dark', reduceMotion: true });
    html.removeAttribute('data-theme');
    html.removeAttribute('data-reduce-motion');
    restoreCachedAppearance();
    expect(html).toHaveAttribute('data-theme', 'dark');
    expect(html).toHaveAttribute('data-reduce-motion', 'true');
  });

  it('ignores a damaged cache', () => {
    window.localStorage.setItem('ttd-appearance-v1', '{not json');
    restoreCachedAppearance();
    expect(html).not.toHaveAttribute('data-theme');
  });
});

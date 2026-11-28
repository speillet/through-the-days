import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/client';
import { createTestApi } from '../test/render';
import { NavigationProvider, useNavigation, type NavigationContextValue } from './navigation';
import { StartupProvider, useStartup, type StartupContextValue } from './startup';

describe('StartupProvider', () => {
  function renderStartup(api = createTestApi()) {
    const current: { value: StartupContextValue | null } = { value: null };
    function Probe() {
      current.value = useStartup();
      const { status, error, journalKey, notice } = current.value;
      return (
        <>
          <p>State: {error ? `error ${error.code}` : (status?.state ?? 'opening')}</p>
          <p>Journal key: {journalKey}</p>
          {notice ? <p>Notice: {notice}</p> : null}
        </>
      );
    }
    render(
      <ApiProvider api={api}>
        <StartupProvider>
          <Probe />
        </StartupProvider>
      </ApiProvider>,
    );
    return current;
  }

  it('reads the startup status once mounted', async () => {
    renderStartup(createTestApi({ startup: { state: 'needsMigration' } }));
    expect(screen.getByText('State: opening')).toBeInTheDocument();
    expect(await screen.findByText('State: needsMigration')).toBeInTheDocument();
  });

  it('reports when the status cannot be read', async () => {
    const api = createTestApi();
    vi.spyOn(api, 'startupStatus').mockRejectedValue('native failure');
    renderStartup(api);
    expect(await screen.findByText('State: error unknown')).toBeInTheDocument();
  });

  it('applies a returned status and reopens the workspace with a notice', async () => {
    const current = renderStartup(createTestApi({ startup: { state: 'needsMigration' } }));
    await screen.findByText('State: needsMigration');
    act(() =>
      current.value?.setStatus(
        { state: 'ready', fromVersion: null, message: null, dataLocation: 'Synthetic' },
        'Your journal was upgraded.',
      ),
    );
    expect(screen.getByText('State: ready')).toBeInTheDocument();
    expect(screen.getByText('Journal key: 1')).toBeInTheDocument();
    expect(screen.getByText('Notice: Your journal was upgraded.')).toBeInTheDocument();
    act(() => current.value?.dismissNotice());
    expect(screen.queryByText(/Notice:/)).not.toBeInTheDocument();
    act(() => current.value?.reloadJournal());
    expect(screen.getByText('Journal key: 2')).toBeInTheDocument();
  });

  it('shows a warning instead of a confirmation when an operation did not fully succeed', async () => {
    const current = renderStartup();
    await screen.findByText('State: ready');
    expect(current.value?.noticeTone).toBe('success');
    act(() =>
      current.value?.setStatus(
        { state: 'ready', fromVersion: null, message: null, dataLocation: 'Synthetic' },
        'Synthetic: erasing did not finish.',
        'warning',
      ),
    );
    expect(screen.getByText('Notice: Synthetic: erasing did not finish.')).toBeInTheDocument();
    expect(current.value?.noticeTone).toBe('warning');
    act(() => current.value?.reloadJournal('Synthetic restore complete.'));
    expect(current.value?.noticeTone).toBe('success');
  });
});

describe('NavigationProvider', () => {
  it('switches views and records the requested settings section each time', () => {
    const current: { value: NavigationContextValue | null } = { value: null };
    function Probe() {
      current.value = useNavigation();
      return (
        <p>
          {current.value.view} / {current.value.settingsSection ?? 'none'} / {current.value.requestId}
        </p>
      );
    }
    render(
      <NavigationProvider>
        <Probe />
      </NavigationProvider>,
    );
    expect(screen.getByText('today / none / 0')).toBeInTheDocument();
    act(() => current.value?.navigate('settings', { section: 'backups' }));
    expect(screen.getByText('settings / backups / 1')).toBeInTheDocument();
    act(() => current.value?.navigate('settings', { section: 'backups' }));
    expect(screen.getByText('settings / backups / 2')).toBeInTheDocument();
    act(() => current.value?.navigate('trash', { section: 'privacy' }));
    expect(screen.getByText('trash / none / 3')).toBeInTheDocument();
  });
});

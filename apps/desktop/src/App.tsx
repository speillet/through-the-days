// Application shell: the startup gate until the journal is open, then the
// workspace (navigation rail, status area and the current view).

import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';
import { ApiProvider, isTauri, useApi, type JournalApi } from './api/client';
import { Button } from './components/Button';
import { NavigationRail } from './components/NavigationRail';
import { Notice } from './components/Notice';
import { classNames } from './components/classNames';
import { TAB_STOP } from './components/keyboard';
import { BackupBanner } from './features/backup/BackupBanner';
import { SettingsView } from './features/settings/SettingsView';
import { StartupGate } from './features/startup/StartupGate';
import { TodayView } from './features/today/TodayView';
import { TrashView } from './features/trash/TrashView';
import { BackupProvider } from './state/backup';
import { TodayProvider } from './state/clock';
import { installExitFlush } from './state/exit';
import { FocusModeProvider, useFocusMode } from './state/focus';
import { NavigationProvider, useNavigation, type View } from './state/navigation';
import { PreferencesProvider } from './state/preferences';
import { StartupProvider, useStartup } from './state/startup';
import { useTextSizeShortcuts } from './state/textSize';

export function App({ api, initialView }: { api: JournalApi; initialView?: View }) {
  return (
    <ApiProvider api={api}>
      <ExitFlush />
      <StartupProvider>
        <NavigationProvider initialView={initialView}>
          <Workspace />
        </NavigationProvider>
      </StartupProvider>
    </ApiProvider>
  );
}

/** In the native app, closing the window or quitting waits for pending saves. */
function ExitFlush() {
  const api = useApi();
  useEffect(() => (isTauri() ? installExitFlush(api, getCurrentWindow()) : undefined), [api]);
  return null;
}

function Workspace() {
  const { status, journalKey } = useStartup();
  if (status?.state !== 'ready') return <StartupGate />;
  return (
    <PreferencesProvider key={journalKey}>
      <TodayProvider>
        <BackupProvider>
          <FocusModeProvider>
            <Shell />
          </FocusModeProvider>
        </BackupProvider>
      </TodayProvider>
    </PreferencesProvider>
  );
}

function Shell() {
  const { view } = useNavigation();
  const { focusMode, setFocusMode } = useFocusMode();
  const { notice, noticeTone, dismissNotice } = useStartup();
  const mainRef = useRef<HTMLElement>(null);
  useTextSizeShortcuts();

  // Focus mode belongs to writing; leaving Today brings the navigation back.
  useEffect(() => {
    if (focusMode && view !== 'today') setFocusMode(false);
  }, [focusMode, view, setFocusMode]);

  return (
    <div className={classNames('app-shell', focusMode && 'app-shell--focus')}>
      <a
        className="skip-link"
        href="#main-content"
        tabIndex={TAB_STOP}
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      {focusMode ? null : <NavigationRail />}
      <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
        <div className="status-area">
          {notice ? (
            <Notice
              tone={noticeTone}
              actions={
                <Button variant="quiet" size="small" onClick={dismissNotice}>
                  Dismiss
                </Button>
              }
            >
              {notice}
            </Notice>
          ) : null}
          <BackupBanner />
        </div>
        {view === 'today' ? <TodayView /> : view === 'trash' ? <TrashView /> : <SettingsView />}
      </main>
    </div>
  );
}

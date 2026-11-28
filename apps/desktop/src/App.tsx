// Application shell: the startup gate until the journal is open, then the
// workspace (navigation rail, status area and the current view). A view that fails
// while rendering is replaced by a recoverable message; the rest stays mounted.

import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef } from 'react';
import { ApiProvider, isTauri, useApi, type JournalApi } from './api/client';
import { Button } from './components/Button';
import { NavigationRail } from './components/NavigationRail';
import { Notice } from './components/Notice';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { classNames } from './components/classNames';
import { TAB_STOP } from './components/keyboard';
import { BackupBanner } from './features/backup/BackupBanner';
import { SettingsView } from './features/settings/SettingsView';
import { StartupGate } from './features/startup/StartupGate';
import { TodayView } from './features/today/TodayView';
import { CalendarView } from './features/reading/CalendarView';
import { BookView } from './features/reading/BookView';
import { TrendsView } from './features/reading/TrendsView';
import { WeeklyView } from './features/reading/WeeklyView';
import { PathView } from './features/reading/PathView';
import { ReadingProvider, useReading } from './features/reading/state';
import './features/reading/reading.css';
import { TrashView } from './features/trash/TrashView';
import { BackupProvider } from './state/backup';
import { TodayProvider } from './state/clock';
import { installExitFlush } from './state/exit';
import { setPendingInputOpener } from './state/flush';
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
            <ReadingProvider>
              <Shell />
            </ReadingProvider>
          </FocusModeProvider>
        </BackupProvider>
      </TodayProvider>
    </PreferencesProvider>
  );
}

function Shell() {
  const { view, target, requestId, navigate } = useNavigation();
  const { focusMode, setFocusMode } = useFocusMode();
  const { notice, noticeTone, showNotice, dismissNotice } = useStartup();
  const { setDate: setReadingDate } = useReading();
  const mainRef = useRef<HTMLElement>(null);
  useTextSizeShortcuts();

  // Input whose save still fails is shown, with why, when a close, quit, restore or
  // erasure is refused for it: Today on its date and slot, or Weekly Review on its week.
  useEffect(
    () =>
      setPendingInputOpener((input, reason) => {
        if (reason) showNotice(reason, 'warning');
        if (input.kind === 'entry') {
          navigate('today', { date: input.date, slot: input.slot });
        } else {
          setReadingDate(input.week);
          navigate('weekly');
        }
      }),
    [navigate, setReadingDate, showNotice],
  );

  // Focus mode belongs to writing; leaving Today brings the navigation back.
  useEffect(() => {
    if (focusMode && view !== 'today') setFocusMode(false);
  }, [focusMode, view, setFocusMode]);

  // A failed view also ends focus mode, so the navigation is there to leave it.
  const leaveFocusMode = useCallback(() => setFocusMode(false), [setFocusMode]);

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
        <ViewErrorBoundary resetKey={requestId} onError={leaveFocusMode}>
          {view === 'today' ? (
            <TodayView key={requestId} initialDate={target?.date} initialSlot={target?.slot} />
          ) : view === 'trash' ? (
            <TrashView />
          ) : view === 'settings' ? (
            <SettingsView />
          ) : view === 'book' ? (
            <BookView />
          ) : view === 'trends' ? (
            <TrendsView />
          ) : view === 'weekly' ? (
            <WeeklyView />
          ) : view === 'path' ? (
            <PathView />
          ) : (
            <CalendarView journal={view === 'journal'} />
          )}
        </ViewErrorBoundary>
      </main>
    </div>
  );
}

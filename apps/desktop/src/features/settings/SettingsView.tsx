// Settings, in a fixed order. SettingsView owns each section's frame and h2 so
// navigate('settings', { section }) can scroll to and focus any heading; the
// section components render only their bodies.

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { Notice } from '../../components/Notice';
import { useNavigation, type SettingsSection } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { AppearanceSection } from './AppearanceSection';
import { BackupSection } from './BackupSection';
import { EraseSection } from './EraseSection';
import { GentleSection } from './GentleSection';
import { PrivacySection } from './PrivacySection';
import { TimeZoneSection } from './TimeZoneSection';
import { WritingSection } from './WritingSection';
import './settings.css';

const SETTINGS_SECTIONS: readonly { id: SettingsSection; title: string; Body: ComponentType }[] = [
  { id: 'appearance', title: 'Appearance', Body: AppearanceSection },
  { id: 'writing', title: 'Writing', Body: WritingSection },
  { id: 'timeZone', title: 'Time zone', Body: TimeZoneSection },
  { id: 'gentle', title: 'Gentle view', Body: GentleSection },
  { id: 'backups', title: 'Backups', Body: BackupSection },
  { id: 'privacy', title: 'Privacy', Body: PrivacySection },
  { id: 'erase', title: 'Erase app data', Body: EraseSection },
];

export function settingsHeadingId(section: SettingsSection): string {
  return `settings-${section}-heading`;
}

const PREFERENCES_UNREADABLE_TEXT =
  'Until they can be read, the app shows the defaults and does not save changes, so the stored settings are kept. Resetting replaces them with these defaults, including the time zone, without changing your entries.';

/**
 * Says that display preferences could not be read, with the only action that replaces
 * them, or that a change could not be saved.
 */
function PreferencesNotice() {
  const { unreadable, reset, error, clearError } = usePreferences();
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  // The reset button leaves with the problem it solved: keep keyboard focus on the confirmation.
  useEffect(() => {
    if (resetDone) statusRef.current?.focus();
  }, [resetDone]);

  async function resetPreferences() {
    if (resetting) return;
    setResetting(true);
    const done = await reset();
    setResetting(false);
    setResetDone(done);
  }

  let notice: ReactNode = null;
  if (unreadable) {
    notice = (
      <Notice
        tone="error"
        title="Display settings could not be read"
        actions={
          <Button variant="secondary" size="small" busy={resetting} onClick={() => void resetPreferences()}>
            Reset display settings
          </Button>
        }
      >
        {error ? <p>{error.message}</p> : null}
        <p>{PREFERENCES_UNREADABLE_TEXT}</p>
      </Notice>
    );
  } else if (error) {
    notice = (
      <Notice
        tone="error"
        actions={
          <Button
            variant="quiet"
            size="small"
            onClick={() => {
              clearError();
              setResetDone(false);
            }}
          >
            Dismiss
          </Button>
        }
      >
        {error.message}
      </Notice>
    );
  } else if (resetDone) {
    notice = (
      <Notice
        tone="success"
        actions={
          <Button variant="quiet" size="small" onClick={() => setResetDone(false)}>
            Dismiss
          </Button>
        }
      >
        Display settings were reset to the defaults.
      </Notice>
    );
  }
  if (!notice) return null;
  return (
    <div ref={statusRef} className="settings__status" tabIndex={-1}>
      {notice}
    </div>
  );
}

export function SettingsView() {
  const { settingsSection, requestId, navigate } = useNavigation();
  const headings = useRef(new Map<SettingsSection, HTMLHeadingElement>());

  useEffect(() => {
    if (!settingsSection) return;
    const heading = headings.current.get(settingsSection);
    if (!heading) return;
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  }, [settingsSection, requestId]);

  return (
    <div className="view settings">
      <header className="view-header">
        <h1 className="view-title">Settings</h1>
      </header>

      <PreferencesNotice />

      <nav className="settings__index" aria-label="Settings sections">
        <ul>
          {SETTINGS_SECTIONS.map(({ id, title }) => (
            <li key={id}>
              <button
                type="button"
                className="settings__index-link"
                tabIndex={TAB_STOP}
                onClick={() => navigate('settings', { section: id })}
              >
                {title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {SETTINGS_SECTIONS.map(({ id, title, Body }) => (
        <section key={id} className="settings-section" aria-labelledby={settingsHeadingId(id)} data-section={id}>
          <h2
            id={settingsHeadingId(id)}
            className="settings-section__title"
            tabIndex={-1}
            ref={(element) => {
              if (element) headings.current.set(id, element);
              else headings.current.delete(id);
            }}
          >
            {title}
          </h2>
          <Body />
        </section>
      ))}
    </div>
  );
}

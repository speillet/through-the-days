// Settings, in a fixed order. SettingsView owns each section's frame and h2 so
// navigate('settings', { section }) can scroll to and focus any heading; the
// section components render only their bodies.

import { useEffect, useRef, type ComponentType } from 'react';
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

export const SETTINGS_SECTIONS: readonly { id: SettingsSection; title: string; Body: ComponentType }[] = [
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

export function SettingsView() {
  const { settingsSection, requestId, navigate } = useNavigation();
  const { error, clearError } = usePreferences();
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

      {error ? (
        <Notice
          tone="error"
          actions={
            <Button variant="quiet" size="small" onClick={clearError}>
              Dismiss
            </Button>
          }
        >
          {error.message}
        </Notice>
      ) : null}

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

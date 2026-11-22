import { Toggle } from '../../components/Toggle';
import { usePreferences } from '../../state/preferences';

export function GentleSection() {
  const { preferences, update } = usePreferences();
  return (
    <div className="settings-stack">
      <Toggle
        label="Gentle view"
        hint="A simpler view that hides optional scores, suggested durations and completion prompts."
        checked={preferences.gentle}
        onChange={(gentle) => void update({ gentle })}
      />
      <ul className="settings-list">
        <li>Nothing is deleted. Turning Gentle view off brings back your earlier display choices.</li>
        <li>Writing, your small wins and navigation stay available.</li>
        <li>Save problems and backup passphrase requests always stay visible, and daily backups continue.</li>
      </ul>
    </div>
  );
}

import { RadioGroup } from '../../components/RadioGroup';
import { Toggle } from '../../components/Toggle';
import { THEME_OPTIONS } from '../../domain/preferences';
import { usePreferences } from '../../state/preferences';

export function AppearanceSection() {
  const { preferences, update } = usePreferences();
  return (
    <div className="settings-stack">
      <RadioGroup
        legend="Theme"
        name="theme"
        layout="row"
        value={preferences.theme}
        options={THEME_OPTIONS.map((option) => ({
          value: option.id,
          label: option.label,
          description: option.description,
        }))}
        onChange={(theme) => void update({ theme })}
      />
      <Toggle
        label="Reduce motion"
        hint="Turns off nonessential animation in the app. The macOS Reduce motion setting is always respected."
        checked={preferences.reduceMotion}
        onChange={(reduceMotion) => void update({ reduceMotion })}
      />
    </div>
  );
}

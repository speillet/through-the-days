import type { TextScale } from '../../api/types';
import { RadioGroup } from '../../components/RadioGroup';
import { Toggle } from '../../components/Toggle';
import { TEXT_SCALE_OPTIONS, THEME_OPTIONS } from '../../domain/preferences';
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
      <RadioGroup
        legend="Text size"
        name="text-size"
        layout="row"
        hint="Changes the size of all text in the app, including your journal pages. You can also press ⌘+ to make text larger, ⌘− to make it smaller and ⌘0 to return to the default size."
        value={String(preferences.textScale)}
        options={TEXT_SCALE_OPTIONS.map((option) => ({
          value: String(option.id),
          label: option.label,
          description: option.description,
        }))}
        onChange={(value) => void update({ textScale: Number(value) as TextScale })}
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

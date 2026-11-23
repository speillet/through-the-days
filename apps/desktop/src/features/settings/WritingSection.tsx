import { RadioGroup } from '../../components/RadioGroup';
import { Toggle } from '../../components/Toggle';
import { DEPTH_OPTIONS } from '../../domain/copy';
import { usePreferences } from '../../state/preferences';

export function WritingSection() {
  const { preferences, visibility, update } = usePreferences();
  return (
    <div className="settings-stack">
      <RadioGroup
        legend="Default writing depth"
        name="default-depth"
        hint="New entries start at this depth. You can switch at any time without changing what you wrote."
        value={preferences.defaultDepth}
        options={DEPTH_OPTIONS.map((option) => ({
          value: option.id,
          label: option.label,
          description: visibility.durations ? `${option.duration}. ${option.summary}` : option.summary,
        }))}
        onChange={(defaultDepth) => void update({ defaultDepth })}
      />
      <Toggle
        label="Show suggested durations"
        hint="A rough guide beside each writing depth. There is never a timer."
        checked={preferences.showDurations}
        onChange={(showDurations) => void update({ showDurations })}
      />
      <Toggle
        label="Show formatting toolbar"
        hint="Keyboard shortcuts such as ⌘B and ⌘I work either way."
        checked={preferences.showToolbar}
        onChange={(showToolbar) => void update({ showToolbar })}
      />
      <Toggle
        label="Show word count"
        checked={preferences.showWordCount}
        onChange={(showWordCount) => void update({ showWordCount })}
      />
      <Toggle
        label="Show scores"
        hint="Shows the mood, energy, pride and progress questions in the check-in; in Quick Check-in, the whole check-in. Hiding them keeps saved answers, and marking an entry complete still needs a mood and an energy score."
        checked={preferences.showScores}
        onChange={(showScores) => void update({ showScores })}
      />
      {preferences.gentle ? (
        <p className="settings-note">
          Gentle view is on, so scores and suggested durations stay hidden. Your choices here are kept for when you
          turn it off.
        </p>
      ) : null}
    </div>
  );
}

// The questions of each check-in stage. Every answer is optional and saved as
// its own value; a skipped question stays empty rather than being guessed.

import { Check, Plus } from 'lucide-react';
import type { Entry, Reflection } from '../../api/types';
import { Button } from '../../components/Button';
import { TextArea } from '../../components/TextField';
import { familyById, quadrantFor } from '../../domain/emotions';
import { hasPrideWin, isBlank, promotePride } from '../../domain/entry';
import type { EntryChange } from '../../state/autosave';
import { ActionsPicker } from './ActionsPicker';
import { EmotionPicker } from './EmotionPicker';
import { ScoreScale } from './ScoreScale';
import { ENERGY_SCALE, MOOD_SCALE, PRIDE_SCALE, PROGRESS_SCALE } from './scales';
import type { StageId } from './stages';
import { WinsList } from './WinsList';

interface FieldsProps {
  values: Entry;
  showScores: boolean;
  onChange(change: EntryChange): void;
}

function setScore(key: 'mood' | 'energy' | 'pride' | 'progress', value: number | null): EntryChange {
  return (entry) => (entry[key] === value ? entry : { ...entry, [key]: value });
}

function setReflection(key: keyof Reflection, value: string): EntryChange {
  return (entry) => (entry.reflection[key] === value ? entry : { ...entry, reflection: { ...entry.reflection, [key]: value } });
}

function ReflectionField({
  label,
  field,
  values,
  onChange,
  hint,
}: {
  label: string;
  field: keyof Reflection;
  hint?: string;
} & Pick<FieldsProps, 'values' | 'onChange'>) {
  return (
    <TextArea
      label={label}
      hint={hint}
      rows={2}
      value={values.reflection[field]}
      onChange={(event) => onChange(setReflection(field, event.currentTarget.value))}
    />
  );
}

/** A plain description of where the two scores sit; never a correction of the chosen word. */
export function QuadrantNote({ mood, energy }: { mood: number | null; energy: number | null }) {
  if (mood === null || energy === null) return null;
  const family = quadrantFor(mood, energy);
  if (!family) {
    return <p className="quadrant-note">A score of 5 is neutral, so no feeling area is suggested.</p>;
  }
  return (
    <p className="quadrant-note" data-family={family}>
      <span className="family-marker" aria-hidden="true" />
      These scores sit with “{familyById(family).label.toLowerCase()}” feelings. Any word you choose stays as you
      chose it.
    </p>
  );
}

/** Mood and energy, the two scores a completed entry needs. */
export function FeelingScores({ values, onChange }: Pick<FieldsProps, 'values' | 'onChange'>) {
  return (
    <>
      <ScoreScale wording={MOOD_SCALE} value={values.mood} onChange={(value) => onChange(setScore('mood', value))} />
      <ScoreScale
        wording={ENERGY_SCALE}
        value={values.energy}
        onChange={(value) => onChange(setScore('energy', value))}
      />
      <QuadrantNote mood={values.mood} energy={values.energy} />
    </>
  );
}

function PrideReflection({ values, onChange }: Pick<FieldsProps, 'values' | 'onChange'>) {
  const promoted = hasPrideWin(values);
  const available = !promoted && !isBlank(values.reflection.proudOf);
  return (
    <div className="pride">
      <ReflectionField label="What am I proud of?" field="proudOf" values={values} onChange={onChange} />
      <div className="pride__promote">
        <Button
          variant="secondary"
          size="small"
          icon={promoted ? <Check size={14} /> : <Plus size={14} />}
          aria-disabled={!available || undefined}
          // Idempotent: a second request adds nothing.
          onClick={() => onChange(promotePride)}
        >
          {promoted ? 'Added as a small win' : 'Add as a small win'}
        </Button>
        <p className="checkin-field__note" role="status">
          {promoted ? 'Added to your small wins. It counts once.' : ''}
        </p>
      </div>
    </div>
  );
}

export function StageFields({ stage, slot, values, showScores, onChange }: FieldsProps & { stage: StageId; slot: Entry['slot'] }) {
  switch (stage) {
    case 'feeling':
      return (
        <>
          {showScores ? <FeelingScores values={values} onChange={onChange} /> : null}
          <EmotionPicker
            emotion={values.emotion}
            anotherEmotion={values.anotherEmotion}
            onEmotionChange={(emotion) =>
              onChange((entry) => (entry.emotion === emotion ? entry : { ...entry, emotion }))
            }
            onAnotherEmotionChange={(anotherEmotion) =>
              onChange((entry) => (entry.anotherEmotion === anotherEmotion ? entry : { ...entry, anotherEmotion }))
            }
          />
        </>
      );
    case 'intention':
      return (
        <>
          <ReflectionField
            label="What would I like to try today?"
            field="intention"
            values={values}
            onChange={onChange}
            hint="An intention, not a promise. It's never counted as done."
          />
          {/* In the Evening, the next step and activities have their own stages. */}
          {slot === 'morning' ? (
            <>
              <ReflectionField label="One small step to try" field="nextStep" values={values} onChange={onChange} />
              <ActionsPicker
                legend="Anything already done today?"
                hint="Optional. Only what you record here counts as done."
                actions={values.actions}
                onChange={onChange}
              />
            </>
          ) : null}
        </>
      );
    case 'actions':
      return (
        <ActionsPicker
          legend="What have I done since my last check-in?"
          hint="Optional. Rest counts as an activity if you record it."
          actions={values.actions}
          onChange={onChange}
        />
      );
    case 'wins':
      return (
        <>
          <WinsList wins={values.wins} onChange={onChange} />
          <PrideReflection values={values} onChange={onChange} />
          {showScores ? (
            <ScoreScale wording={PRIDE_SCALE} value={values.pride} onChange={(value) => onChange(setScore('pride', value))} />
          ) : null}
        </>
      );
    case 'progress':
      return (
        <ScoreScale
          wording={PROGRESS_SCALE}
          value={values.progress}
          onChange={(value) => onChange(setScore('progress', value))}
        />
      );
    case 'reflect':
      return (
        <>
          <ReflectionField label="What helped?" field="helped" values={values} onChange={onChange} />
          <ReflectionField label="What did I learn?" field="learned" values={values} onChange={onChange} />
        </>
      );
    case 'difficult':
      return (
        <>
          <ReflectionField label="What was difficult?" field="difficulty" values={values} onChange={onChange} />
          {slot === 'evening' ? (
            <ReflectionField
              label="What's one small step I could take next?"
              field="nextStep"
              values={values}
              onChange={onChange}
            />
          ) : null}
        </>
      );
  }
}

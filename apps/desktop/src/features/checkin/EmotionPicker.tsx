// The original English emotion vocabulary, grouped by family. A chosen word is
// shown with a check mark and in words, never by colour alone, and is never
// corrected to match the scores. "Another emotion…" keeps the person's own word.

import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { classNames } from '../../components/classNames';
import { TAB_STOP } from '../../components/keyboard';
import { TextField } from '../../components/TextField';
import { EMOTION_FAMILIES, EMOTIONS, emotionById, emotionsInFamily, type Emotion } from '../../domain/emotions';

interface EmotionPickerProps {
  emotion: string;
  anotherEmotion: string;
  onEmotionChange(id: string): void;
  onAnotherEmotionChange(text: string): void;
}

export function EmotionPicker({ emotion, anotherEmotion, onEmotionChange, onAnotherEmotionChange }: EmotionPickerProps) {
  const id = useId();
  const [described, setDescribed] = useState<Emotion | null>(null);
  const [anotherOpen, setAnotherOpen] = useState(anotherEmotion !== '');
  const [focusAnother, setFocusAnother] = useState(false);
  const anotherRef = useRef<HTMLInputElement>(null);
  const chosen = emotionById(emotion) ?? null;
  const shown = described ?? chosen;

  useEffect(() => {
    if (!focusAnother) return;
    setFocusAnother(false);
    anotherRef.current?.focus();
  }, [focusAnother]);

  return (
    <fieldset className="emotion-picker" aria-describedby={`${id}-hint`}>
      <legend className="emotion-picker__legend">Which word fits?</legend>
      <p id={`${id}-hint`} className="emotion-picker__hint">
        Optional. Choose the word that feels closest, even if it doesn't match your scores.
      </p>
      {EMOTION_FAMILIES.map((family) => (
        <div
          key={family.id}
          className="emotion-family"
          data-family={family.id}
          role="group"
          aria-labelledby={`${id}-${family.id}`}
        >
          <p id={`${id}-${family.id}`} className="emotion-family__label">
            <span className="family-marker" aria-hidden="true" />
            {family.label}
          </p>
          <div className="emotion-family__options">
            {emotionsInFamily(family.id).map((item) => {
              const selected = item.id === emotion;
              return (
                <label
                  key={item.id}
                  className={classNames('emotion-chip', selected && 'emotion-chip--selected')}
                  onMouseEnter={() => setDescribed(item)}
                  onMouseLeave={() => setDescribed(null)}
                >
                  <input
                    type="radio"
                    className="emotion-chip__input"
                    name={`${id}-emotion`}
                    value={item.id}
                    checked={selected}
                    tabIndex={TAB_STOP}
                    aria-describedby={`${id}-${item.id}-description`}
                    onChange={() => onEmotionChange(item.id)}
                    onFocus={() => setDescribed(item)}
                    onBlur={() => setDescribed(null)}
                  />
                  {selected ? <Check className="emotion-chip__check" aria-hidden="true" size={14} strokeWidth={2.5} /> : null}
                  <span className="emotion-chip__label">{item.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {/* Read with each word (aria-describedby) without being read again on its own. */}
      <div hidden>
        {EMOTIONS.map((item) => (
          <span key={item.id} id={`${id}-${item.id}-description`}>
            {item.description}
          </span>
        ))}
      </div>
      <p className="emotion-picker__detail" aria-hidden="true">
        {shown ? (
          <>
            <strong>{shown.label}:</strong> {shown.description}
          </>
        ) : (
          'Hover over or focus a word to read what it means.'
        )}
      </p>
      {chosen ? (
        <div className="emotion-picker__chosen">
          <p>
            Chosen: <strong>{chosen.label}</strong>
          </p>
          <Button variant="quiet" size="small" aria-label={`Clear ${chosen.label}`} onClick={() => onEmotionChange('')}>
            Clear
          </Button>
        </div>
      ) : null}
      {anotherOpen ? (
        <TextField
          ref={anotherRef}
          label="Another emotion"
          hint="In your own words, in any language."
          value={anotherEmotion}
          onChange={(event) => onAnotherEmotionChange(event.currentTarget.value)}
        />
      ) : (
        <Button
          variant="quiet"
          size="small"
          className="emotion-picker__another"
          onClick={() => {
            setAnotherOpen(true);
            setFocusAnother(true);
          }}
        >
          Another emotion…
        </Button>
      )}
    </fieldset>
  );
}

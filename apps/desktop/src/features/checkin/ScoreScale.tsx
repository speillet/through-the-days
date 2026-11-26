// A 0–10 or 1–10 self-report as one native radio group: arrow keys change the
// value, each option is announced with its number and meaning, and the chosen
// value is repeated in words beside a Clear button, so colour is never needed.

import { Check } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../../components/Button';
import { classNames } from '../../components/classNames';
import { TAB_STOP } from '../../components/keyboard';
import type { ScaleWording } from './scales';

interface ScoreScaleProps {
  wording: ScaleWording;
  value: number | null;
  onChange(value: number | null): void;
}

function scoreSummary(wording: ScaleWording, value: number): string {
  const words = wording.describe(value);
  return words ? `${value}, ${words}` : String(value);
}

export function ScoreScale({ wording, value, onChange }: ScoreScaleProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const values = Array.from({ length: wording.max - wording.min + 1 }, (_, index) => wording.min + index);
  return (
    <fieldset className="score-scale" aria-describedby={hintId}>
      <legend className="score-scale__legend">{wording.legend}</legend>
      <p id={hintId} className="score-scale__hint">
        {wording.hint}
      </p>
      <div className="score-scale__options" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
        {values.map((option) => {
          const checked = option === value;
          return (
            <label
              key={option}
              className={classNames('score-scale__option', checked && 'score-scale__option--checked')}
            >
              <input
                type="radio"
                className="score-scale__input"
                name={id}
                value={option}
                checked={checked}
                tabIndex={TAB_STOP}
                aria-label={scoreSummary(wording, option)}
                onChange={() => onChange(option)}
              />
              <span className="score-scale__number" aria-hidden="true">
                {option}
              </span>
            </label>
          );
        })}
      </div>
      <div className="score-scale__captions" aria-hidden="true">
        <span>{wording.captions.start}</span>
        {wording.captions.middle ? <span>{wording.captions.middle}</span> : <span />}
        <span>{wording.captions.end}</span>
      </div>
      {value !== null ? (
        <div className="score-scale__summary">
          <p>
            <Check aria-hidden="true" size={14} /> Selected: {scoreSummary(wording, value)}
          </p>
          <Button variant="quiet" size="small" aria-label={wording.clearLabel} onClick={() => onChange(null)}>
            Clear
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

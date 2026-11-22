// The optional guided check-in beside the journal page. Each stage offers Back,
// Skip and Continue; "Write directly" is always there, and the step list lets
// the person revisit any stage. Moving between stages records nothing.

import { PenLine } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Entry, Slot } from '../../api/types';
import { Button } from '../../components/Button';
import { classNames } from '../../components/classNames';
import { TAB_STOP } from '../../components/keyboard';
import type { EntryChange } from '../../state/autosave';
import { FeelingScores, StageFields } from './CheckInFields';
import { checkInStages, type StageId } from './stages';
import './checkin.css';

export interface CheckInProps {
  slot: Slot;
  /** Current answers; a blank draft when nothing was recorded yet. */
  values: Entry;
  showScores: boolean;
  onChange(change: EntryChange): void;
  /** Moves focus to the journal page. */
  onWriteDirectly(): void;
}

export function CheckIn({ slot, values, showScores, onChange, onWriteDirectly }: CheckInProps) {
  const titleId = useId();
  const stages = checkInStages(slot, showScores);
  const [current, setCurrent] = useState<StageId | 'done'>(stages[0].id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const announceMove = useRef(false);

  // A stage hidden meanwhile (scores switched off) falls back to the next one available.
  const found = stages.findIndex((stage) => stage.id === current);
  const index = current === 'done' ? stages.length : found === -1 ? 0 : found;
  const stage = index < stages.length ? stages[index] : null;

  useEffect(() => {
    if (!announceMove.current) return;
    announceMove.current = false;
    headingRef.current?.focus();
  }, [current]);

  function goTo(next: StageId | 'done') {
    announceMove.current = true;
    setCurrent(next);
  }

  const goNext = () => goTo(index + 1 < stages.length ? stages[index + 1].id : 'done');

  return (
    <section className="checkin panel" aria-labelledby={titleId}>
      <div className="checkin__header">
        <h2 id={titleId} className="checkin__title">
          Check-in
        </h2>
        <Button variant="quiet" size="small" icon={<PenLine size={15} />} onClick={onWriteDirectly}>
          Write directly
        </Button>
      </div>
      <p className="checkin__hint">Every question is optional. Answers are saved as you go.</p>
      <ol className="checkin__steps" aria-label="Check-in steps">
        {stages.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              tabIndex={TAB_STOP}
              className={classNames('checkin__step', item.id === stage?.id && 'checkin__step--current')}
              aria-current={item.id === stage?.id ? 'step' : undefined}
              onClick={() => goTo(item.id)}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ol>

      {stage ? (
        <div className="checkin__stage">
          <h3 ref={headingRef} tabIndex={-1} className="checkin__stage-title">
            {stage.title}
          </h3>
          <div className="checkin__fields">
            <StageFields stage={stage.id} slot={slot} values={values} showScores={showScores} onChange={onChange} />
          </div>
          <div className="checkin__nav">
            {index > 0 ? (
              <Button variant="secondary" size="small" onClick={() => goTo(stages[index - 1].id)}>
                Back
              </Button>
            ) : null}
            <span className="checkin__nav-spacer" />
            <Button variant="quiet" size="small" onClick={goNext}>
              Skip
            </Button>
            <Button variant="primary" size="small" onClick={goNext}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="checkin__stage">
          <h3 ref={headingRef} tabIndex={-1} className="checkin__stage-title">
            Check-in finished
          </h3>
          <p className="checkin__hint">You can revisit any step above, or carry on writing.</p>
          <div className="checkin__nav">
            <Button variant="secondary" size="small" onClick={() => goTo(stages[stages.length - 1].id)}>
              Back
            </Button>
            <span className="checkin__nav-spacer" />
            <Button variant="primary" size="small" icon={<PenLine size={15} />} onClick={onWriteDirectly}>
              Start writing
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Quick Check-in: only mood and energy beside the page. */
export function QuickCheckIn({ values, onChange }: Pick<CheckInProps, 'values' | 'onChange'>) {
  const titleId = useId();
  return (
    <section className="checkin panel" aria-labelledby={titleId}>
      <h2 id={titleId} className="checkin__title">
        How am I feeling?
      </h2>
      <p className="checkin__hint">Optional. A sentence or two on the page is plenty.</p>
      <div className="checkin__fields">
        <FeelingScores values={values} onChange={onChange} />
      </div>
    </section>
  );
}

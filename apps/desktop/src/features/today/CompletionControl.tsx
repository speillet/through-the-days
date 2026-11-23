// The entry's status as text, and the explicit completion action. Completion is
// only ever requested by the person; a refusal explains in English what is
// missing and the entry stays a draft with everything kept.

import { CircleCheck } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CommandError, Entry } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { canComplete, documentText, isBlank } from '../../domain/entry';
import { isStaleRefusal } from '../../state/autosave';
import { ENTRY_STATUS_LABELS, entryStatus } from './status';

/** What a completion request still needs, in plain English. */
export function completionExplanation(entry: Entry | null, showScores: boolean): string {
  const missing: string[] = [];
  if (!entry || isBlank(documentText(entry.document))) missing.push('some writing');
  if (!entry || entry.mood === null) missing.push('a mood score');
  if (!entry || entry.energy === null) missing.push('an energy score');
  if (missing.length === 0) return 'This entry could not be marked complete. It stays a draft.';
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  const scoresHidden =
    !showScores && (!entry || entry.mood === null || entry.energy === null)
      ? ' Scores are hidden at the moment; you can show them in Settings, under Writing.'
      : '';
  return `To mark this entry complete, add ${list}. It stays a draft until then, with everything kept.${scoresHidden}`;
}

export interface CompletionControlProps {
  entry: Entry | null;
  /** False in Gentle view: no completion prompts or control. */
  showControl: boolean;
  showScores: boolean;
  onMarkComplete(): Promise<CommandError | null>;
  onMarkDraft(): Promise<CommandError | null>;
}

export function CompletionControl({ entry, showControl, showScores, onMarkComplete, onMarkDraft }: CompletionControlProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const latest = useRef(entry);
  useLayoutEffect(() => {
    latest.current = entry;
  });
  const status = entryStatus(entry);

  // A stale explanation disappears once the entry has what completion needs.
  useEffect(() => {
    if (entry && canComplete(entry)) setMessage(null);
  }, [entry]);

  async function run(action: () => Promise<CommandError | null>) {
    setBusy(true);
    setMessage(null);
    const error = await action();
    setBusy(false);
    // A saved entry that changed or disappeared is explained by the save failure notice,
    // which offers to reload it.
    if (!error || isStaleRefusal(error)) return;
    setMessage(error.code === 'completion' ? completionExplanation(latest.current, showScores) : error.message);
  }

  return (
    <div className="completion">
      <p className="completion__status">
        {status === 'complete' ? <CircleCheck aria-hidden="true" size={15} /> : null}
        <span className="visually-hidden">Entry status: </span>
        {ENTRY_STATUS_LABELS[status]}
      </p>
      {showControl && entry ? (
        entry.complete ? (
          <Button variant="secondary" size="small" busy={busy} onClick={() => void run(onMarkDraft)}>
            Mark as draft
          </Button>
        ) : (
          <Button variant="secondary" size="small" busy={busy} onClick={() => void run(onMarkComplete)}>
            Mark complete
          </Button>
        )
      ) : null}
      {message ? (
        <Notice tone="info" className="completion__message">
          {message}
        </Notice>
      ) : null}
    </div>
  );
}

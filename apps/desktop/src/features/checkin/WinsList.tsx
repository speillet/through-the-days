// Small wins: dated items the person explicitly recognises. They can be added,
// edited and removed, and each can be kept out of future summaries. Nothing is
// added automatically; "Nothing to add today" is always a fine answer.

import { Check, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { Win } from '../../api/types';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { TextField } from '../../components/TextField';
import { isBlank, newId } from '../../domain/entry';
import type { EntryChange } from '../../state/autosave';

export interface WinsListProps {
  wins: readonly Win[];
  onChange(change: EntryChange): void;
}

export function WinsList({ wins, onChange }: WinsListProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [nothingToAdd, setNothingToAdd] = useState(false);

  function add(event: FormEvent) {
    event.preventDefault();
    if (isBlank(draft)) return;
    const text = draft;
    onChange((entry) => ({
      ...entry,
      wins: [...entry.wins, { id: newId(), text, origin: 'manual', includeInInsights: true }],
    }));
    setDraft('');
    setNothingToAdd(false);
  }

  function updateWin(winId: string, patch: Partial<Pick<Win, 'text' | 'includeInInsights'>>) {
    onChange((entry) => ({
      ...entry,
      wins: entry.wins.map((win) => (win.id === winId ? { ...win, ...patch } : win)),
    }));
  }

  function remove(winId: string) {
    onChange((entry) => ({ ...entry, wins: entry.wins.filter((win) => win.id !== winId) }));
  }

  return (
    <fieldset className="wins" aria-describedby={`${id}-hint`}>
      <legend className="checkin-field__legend">What did I manage to do, even if it felt small?</legend>
      <p id={`${id}-hint`} className="checkin-field__hint">
        Optional. Only what you add here counts as a small win. Untick “Include in insights” to keep one out of
        future summaries.
      </p>
      {wins.length > 0 ? (
        <ul className="wins__list" aria-label="Small wins">
          {wins.map((win, index) => (
            <WinRow
              key={win.id}
              win={win}
              position={index + 1}
              onUpdate={(patch) => updateWin(win.id, patch)}
              onRemove={() => remove(win.id)}
            />
          ))}
        </ul>
      ) : null}
      <form className="inline-add" onSubmit={add}>
        <TextField label="Add a small win" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
        <Button type="submit" variant="secondary" size="small">
          Add
        </Button>
      </form>
      {wins.length === 0 ? (
        nothingToAdd ? (
          <p className="checkin-field__note" role="status">
            <Check aria-hidden="true" size={14} /> Nothing to add today. That's fine.
          </p>
        ) : (
          <Button variant="quiet" size="small" onClick={() => setNothingToAdd(true)}>
            Nothing to add today
          </Button>
        )
      ) : null}
    </fieldset>
  );
}

function WinRow({
  win,
  position,
  onUpdate,
  onRemove,
}: {
  win: Win;
  position: number;
  onUpdate(patch: Partial<Pick<Win, 'text' | 'includeInInsights'>>): void;
  onRemove(): void;
}) {
  // Local text, so clearing the field never sends a win without words.
  const [text, setText] = useState(win.text);
  const blank = isBlank(text);
  return (
    <li className="win">
      <TextField
        label={`Small win ${position}`}
        labelHidden
        value={text}
        error={blank ? 'A small win needs some words. Remove it if you prefer.' : undefined}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setText(next);
          if (!isBlank(next)) onUpdate({ text: next });
        }}
        onBlur={() => {
          if (blank) setText(win.text);
        }}
      />
      <div className="win__details">
        {win.origin === 'pride' ? <span className="win__origin">From what I'm proud of</span> : null}
        <label className="checkbox">
          <input
            type="checkbox"
            tabIndex={TAB_STOP}
            checked={win.includeInInsights}
            onChange={(event) => onUpdate({ includeInInsights: event.currentTarget.checked })}
          />
          Include in insights
        </label>
        <Button
          variant="quiet"
          size="small"
          icon={<X size={14} />}
          aria-label={`Remove small win ${position}`}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

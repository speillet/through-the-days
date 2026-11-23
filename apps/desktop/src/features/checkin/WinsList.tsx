// Small wins: dated items the person explicitly recognises. They can be added,
// edited and removed, and each can be kept out of future summaries. Nothing is
// added automatically; "Nothing to add today" is always a fine answer. A win being
// typed is saved with the entry straight away, and a win keeps its line breaks.

import { Check, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { Entry, Win } from '../../api/types';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { TextArea, TextField } from '../../components/TextField';
import { isBlank } from '../../domain/entry';
import type { EntryChange } from '../../state/autosave';
import { useTypedItem } from './typedItem';

export interface WinsListProps {
  wins: readonly Win[];
  onChange(change: EntryChange): void;
}

function writeWin(entry: Entry, id: string, text: string): Entry {
  const existing = entry.wins.find((win) => win.id === id);
  if (!existing) return { ...entry, wins: [...entry.wins, { id, text, origin: 'manual', includeInInsights: true }] };
  if (existing.text === text) return entry;
  return { ...entry, wins: entry.wins.map((win) => (win.id === id ? { ...win, text } : win)) };
}

export function WinsList({ wins, onChange }: WinsListProps) {
  const id = useId();
  const [nothingToAdd, setNothingToAdd] = useState(false);
  const typed = useTypedItem(onChange, {
    write: (winId, text) => (entry) => writeWin(entry, winId, text),
    remove: (winId) => (entry) => ({ ...entry, wins: entry.wins.filter((win) => win.id !== winId) }),
  });
  const listed = wins.filter((win) => win.id !== typed.typingId);

  function add(event: FormEvent) {
    event.preventDefault();
    if (typed.finish()) setNothingToAdd(false);
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
      {listed.length > 0 ? (
        <ul className="wins__list" aria-label="Small wins">
          {listed.map((win, index) => (
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
        <TextField
          label="Add a small win"
          value={typed.text}
          onChange={(event) => typed.type(event.currentTarget.value)}
        />
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

/** Rows for a win's text: one per line, within reason. */
function rowsFor(text: string): number {
  return Math.min(6, text.split('\n').length);
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
  // Local text, so clearing the field never sends a win without words. A multi-line
  // field, because a win added from "What am I proud of?" can have several lines.
  const [text, setText] = useState(win.text);
  const blank = isBlank(text);
  return (
    <li className="win">
      <TextArea
        label={`Small win ${position}`}
        labelHidden
        rows={rowsFor(text)}
        className="win__text"
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

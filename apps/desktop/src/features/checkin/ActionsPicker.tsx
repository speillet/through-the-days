// Reported actions: things the person explicitly says they did. Preset
// categories toggle on and off; custom actions are added in the person's own
// words, and one being typed is saved with the entry straight away. Nothing here
// becomes a small win unless the person adds one.

import { Check, Plus, X } from 'lucide-react';
import { useId, type FormEvent } from 'react';
import type { Action, Entry } from '../../api/types';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { TextField } from '../../components/TextField';
import { ACTION_CATEGORIES, CUSTOM_ACTION_CATEGORY } from '../../domain/actions';
import { newId } from '../../domain/entry';
import type { EntryChange } from '../../state/autosave';
import { useTypedItem } from './typedItem';

interface ActionsPickerProps {
  legend: string;
  hint?: string;
  actions: readonly Action[];
  onChange(change: EntryChange): void;
}

function writeCustomAction(entry: Entry, id: string, text: string): Entry {
  const existing = entry.actions.find((action) => action.id === id);
  if (!existing) return { ...entry, actions: [...entry.actions, { id, text, category: CUSTOM_ACTION_CATEGORY }] };
  if (existing.text === text) return entry;
  return { ...entry, actions: entry.actions.map((action) => (action.id === id ? { ...action, text } : action)) };
}

export function ActionsPicker({ legend, hint, actions, onChange }: ActionsPickerProps) {
  const id = useId();
  const typed = useTypedItem(onChange, {
    write: (actionId, text) => (entry) => writeCustomAction(entry, actionId, text),
    remove: (actionId) => (entry) => ({ ...entry, actions: entry.actions.filter((action) => action.id !== actionId) }),
  });
  const customActions = actions.filter(
    (action) => action.category === CUSTOM_ACTION_CATEGORY && action.id !== typed.typingId,
  );

  function toggle(category: (typeof ACTION_CATEGORIES)[number]) {
    onChange((entry) =>
      entry.actions.some((action) => action.category === category.id)
        ? { ...entry, actions: entry.actions.filter((action) => action.category !== category.id) }
        : { ...entry, actions: [...entry.actions, { id: newId(), text: category.label, category: category.id }] },
    );
  }

  function addCustom(event: FormEvent) {
    event.preventDefault();
    typed.finish();
  }

  function remove(actionId: string) {
    onChange((entry) => ({ ...entry, actions: entry.actions.filter((action) => action.id !== actionId) }));
  }

  return (
    <fieldset className="actions-picker" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="checkin-field__legend">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="checkin-field__hint">
          {hint}
        </p>
      ) : null}
      <div className="chip-list">
        {ACTION_CATEGORIES.map((category) => {
          const pressed = actions.some((action) => action.category === category.id);
          return (
            <button
              key={category.id}
              type="button"
              tabIndex={TAB_STOP}
              className="chip"
              aria-pressed={pressed}
              onClick={() => toggle(category)}
            >
              {pressed ? (
                <Check aria-hidden="true" size={14} strokeWidth={2.5} />
              ) : (
                <Plus aria-hidden="true" size={14} />
              )}
              {category.label}
            </button>
          );
        })}
      </div>
      {customActions.length > 0 ? (
        <ul className="removable-list" aria-label="Your own activities">
          {customActions.map((action) => (
            <li key={action.id} className="removable-list__item">
              <span>{action.text}</span>
              <Button
                variant="quiet"
                size="small"
                aria-label={`Remove ${action.text}`}
                icon={<X size={14} />}
                onClick={() => remove(action.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <form className="inline-add" onSubmit={addCustom}>
        <TextField
          label="Something else"
          value={typed.text}
          onChange={(event) => typed.type(event.currentTarget.value)}
        />
        <Button type="submit" variant="secondary" size="small">
          Add
        </Button>
      </form>
    </fieldset>
  );
}

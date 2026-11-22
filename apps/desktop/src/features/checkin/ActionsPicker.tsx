// Reported actions: things the person explicitly says they did. Preset
// categories toggle on and off; custom actions are added in the person's own
// words. Nothing here becomes a small win unless the person adds one.

import { Check, Plus, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { Action } from '../../api/types';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { TextField } from '../../components/TextField';
import { ACTION_CATEGORIES, CUSTOM_ACTION_CATEGORY } from '../../domain/actions';
import { isBlank, newId } from '../../domain/entry';
import type { EntryChange } from '../../state/autosave';

export interface ActionsPickerProps {
  legend: string;
  hint?: string;
  actions: readonly Action[];
  onChange(change: EntryChange): void;
}

export function ActionsPicker({ legend, hint, actions, onChange }: ActionsPickerProps) {
  const id = useId();
  const [custom, setCustom] = useState('');
  const customActions = actions.filter((action) => action.category === CUSTOM_ACTION_CATEGORY);

  function toggle(category: (typeof ACTION_CATEGORIES)[number]) {
    onChange((entry) =>
      entry.actions.some((action) => action.category === category.id)
        ? { ...entry, actions: entry.actions.filter((action) => action.category !== category.id) }
        : { ...entry, actions: [...entry.actions, { id: newId(), text: category.label, category: category.id }] },
    );
  }

  function addCustom(event: FormEvent) {
    event.preventDefault();
    if (isBlank(custom)) return;
    const text = custom;
    onChange((entry) => ({
      ...entry,
      actions: [...entry.actions, { id: newId(), text, category: CUSTOM_ACTION_CATEGORY }],
    }));
    setCustom('');
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
        <TextField label="Something else" value={custom} onChange={(event) => setCustom(event.currentTarget.value)} />
        <Button type="submit" variant="secondary" size="small">
          Add
        </Button>
      </form>
    </fieldset>
  );
}

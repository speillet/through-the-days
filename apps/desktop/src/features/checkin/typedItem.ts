// The add field of a list in the check-in (a small win, an activity in the person's
// own words). What is typed becomes part of the entry from the first character, so
// Continue, Skip, another step, depth, slot or date, and quitting all keep it, and the
// save status covers it. Add (or Enter) only empties the field for the next item;
// clearing the field removes the item it was writing.

import { useRef, useState } from 'react';
import { isBlank, newId } from '../../domain/entry';
import type { EntryChange } from '../../state/autosave';

export interface TypedItemChanges {
  /** Creates the item with this id, or gives it this text. */
  write(id: string, text: string): EntryChange;
  remove(id: string): EntryChange;
}

export interface TypedItem {
  /** The add field's value. */
  text: string;
  /** The item the field is writing, kept out of the list above it until it is added. */
  typingId: string | null;
  type(text: string): void;
  /** Keeps the item and empties the field; false when there was nothing to add. */
  finish(): boolean;
}

export function useTypedItem(onChange: (change: EntryChange) => void, changes: TypedItemChanges): TypedItem {
  const [text, setText] = useState('');
  const [typingId, setTypingId] = useState<string | null>(null);
  // Read by event handlers, which can run again before the next render.
  const typing = useRef<string | null>(null);

  function type(next: string) {
    setText(next);
    const current = typing.current;
    if (isBlank(next)) {
      if (current === null) return;
      typing.current = null;
      setTypingId(null);
      onChange(changes.remove(current));
      return;
    }
    const id = current ?? newId();
    if (current === null) {
      typing.current = id;
      setTypingId(id);
    }
    onChange(changes.write(id, next));
  }

  function finish(): boolean {
    if (typing.current === null) return false;
    typing.current = null;
    setTypingId(null);
    setText('');
    return true;
  }

  return { text, typingId, type, finish };
}

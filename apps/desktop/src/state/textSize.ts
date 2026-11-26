// Command-plus, Command-minus and Command-0 change the text size from anywhere in the
// workspace, as in other Mac apps. The size is a display preference saved in the
// journal and also offered in Settings, under Appearance. They do nothing while a modal
// dialog is open: Restore and Erase replace the journal from such a dialog, and a size
// saved meanwhile would carry the replaced journal's preferences into the new one.
// The character a key types decides, so the key labelled "-" makes text smaller on
// every layout, including the French one, where it sits where US keyboards have "=".

import { useEffect, useRef } from 'react';
import { steppedTextScale } from '../domain/preferences';
import { usePreferences } from './preferences';

type ShortcutKey = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey'>;
type Step = -1 | 0 | 1;

const STEP_BY_CHARACTER = new Map<string, Step>([
  ['=', 1],
  ['+', 1],
  ['-', -1],
  ['0', 0],
]);

const STEP_BY_POSITION = new Map<string, Step>([
  ['Equal', 1],
  ['NumpadAdd', 1],
  ['Minus', -1],
  ['NumpadSubtract', -1],
  ['Digit0', 0],
  ['Numpad0', 0],
]);

/** One printable ASCII character, such as ")" where US keyboards have "-" on a French one. */
const ASCII_CHARACTER = /^[\x20-\x7e]$/;

/**
 * +1 for Command-plus (or Command-equals), -1 for Command-minus, 0 for Command-0, else null.
 * The key's position counts only when it types no ASCII character, as the French key that
 * holds 0 (an accented letter without Shift), or a key on a non-Latin layout.
 */
export function textSizeStep(event: ShortcutKey): Step | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const byCharacter = STEP_BY_CHARACTER.get(event.key);
  if (byCharacter !== undefined) return byCharacter;
  if (ASCII_CHARACTER.test(event.key)) return null;
  return STEP_BY_POSITION.get(event.code) ?? null;
}

/** Installs the text-size shortcuts while the workspace is open. */
export function useTextSizeShortcuts(): void {
  const { preferences, update } = usePreferences();
  // The size the last shortcut asked for, so quick presses add up before the journal answers.
  const target = useRef(preferences.textScale);
  const acknowledged = useRef(preferences.textScale);
  useEffect(() => {
    target.current = preferences.textScale;
    acknowledged.current = preferences.textScale;
  }, [preferences.textScale]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const step = textSizeStep(event);
      if (step === null) return;
      event.preventDefault();
      // The rest of the workspace is inert behind a modal dialog; this listener is not.
      if (document.querySelector('[aria-modal="true"]')) return;
      const next = steppedTextScale(target.current, step);
      if (next === target.current) return;
      target.current = next;
      void update({ textScale: next }).then((saved) => {
        if (!saved) target.current = acknowledged.current;
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [update]);
}

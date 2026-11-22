// Command-plus, Command-minus and Command-0 change the text size from anywhere in the
// workspace, as in other Mac apps. The size is a display preference saved in the
// journal and also offered in Settings, under Appearance.

import { useEffect, useRef } from 'react';
import { steppedTextScale } from '../domain/preferences';
import { usePreferences } from './preferences';

type ShortcutKey = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey'>;

/** +1 for Command-plus (or Command-equals), -1 for Command-minus, 0 for Command-0, else null. */
export function textSizeStep(event: ShortcutKey): -1 | 0 | 1 | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key === '=' || event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd') return 1;
  if (event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract') return -1;
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') return 0;
  return null;
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

// Distraction-free writing: the shell hides navigation and nonessential chrome
// while writing and save status stay visible. Today owns the control that toggles it.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface FocusModeContextValue {
  focusMode: boolean;
  setFocusMode(on: boolean): void;
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null);

export function FocusModeProvider({ children }: { children?: ReactNode }) {
  const [focusMode, setFocusMode] = useState(false);
  const value = useMemo(() => ({ focusMode, setFocusMode }), [focusMode]);
  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode(): FocusModeContextValue {
  const value = useContext(FocusModeContext);
  if (!value) throw new Error('useFocusMode must be used inside <FocusModeProvider>.');
  return value;
}

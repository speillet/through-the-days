// Which view the main region shows. Later milestones add views here only when
// they are delivered; unavailable ones are never navigable.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type View = 'today' | 'trash' | 'settings';

export type SettingsSection = 'appearance' | 'writing' | 'timeZone' | 'gentle' | 'backups' | 'privacy' | 'erase';

export interface NavigateOptions {
  /** With the settings view: scroll to and focus this section's heading. */
  section?: SettingsSection;
}

export interface NavigationContextValue {
  view: View;
  settingsSection: SettingsSection | null;
  /** Increments on every navigate call, so repeating a request is noticed. */
  requestId: number;
  navigate(view: View, options?: NavigateOptions): void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children, initialView = 'today' }: { children?: ReactNode; initialView?: View }) {
  const [state, setState] = useState<{ view: View; settingsSection: SettingsSection | null; requestId: number }>({
    view: initialView,
    settingsSection: null,
    requestId: 0,
  });

  const navigate = useCallback((view: View, options: NavigateOptions = {}) => {
    setState((current) => ({
      view,
      settingsSection: view === 'settings' ? (options.section ?? null) : null,
      requestId: current.requestId + 1,
    }));
  }, []);

  const value = useMemo(() => ({ ...state, navigate }), [state, navigate]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be used inside <NavigationProvider>.');
  return value;
}

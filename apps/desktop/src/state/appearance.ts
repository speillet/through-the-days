// Applies the appearance overrides to <html>. CSS follows macOS (prefers-color-scheme,
// prefers-reduced-motion) unless html[data-theme] or html[data-reduce-motion] says otherwise.
// The last applied choice is cached so the next launch starts in the right theme
// before the journal answers.

import type { Preferences, Theme } from '../api/types';

const APPEARANCE_KEY = 'ttd-appearance-v1';

type Appearance = Pick<Preferences, 'theme' | 'reduceMotion'>;

function setAttributes({ theme, reduceMotion }: Appearance, root: HTMLElement): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  if (reduceMotion) root.setAttribute('data-reduce-motion', 'true');
  else root.removeAttribute('data-reduce-motion');
}

export function applyAppearance(appearance: Appearance, root: HTMLElement = document.documentElement): void {
  setAttributes(appearance, root);
  try {
    window.localStorage.setItem(
      APPEARANCE_KEY,
      JSON.stringify({ theme: appearance.theme, reduceMotion: appearance.reduceMotion }),
    );
  } catch {
    // Only a startup convenience; the journal keeps the real preference.
  }
}

export function restoreCachedAppearance(root: HTMLElement = document.documentElement): void {
  try {
    const cached = JSON.parse(window.localStorage.getItem(APPEARANCE_KEY) ?? 'null') as Partial<Appearance> | null;
    if (!cached) return;
    const theme: Theme = cached.theme === 'light' || cached.theme === 'dark' ? cached.theme : 'system';
    setAttributes({ theme, reduceMotion: cached.reduceMotion === true }, root);
  } catch {
    // Ignore an unreadable cache; the system appearance applies until preferences load.
  }
}

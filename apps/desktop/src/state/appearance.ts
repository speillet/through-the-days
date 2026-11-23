// Applies the appearance overrides to <html>. CSS follows macOS (prefers-color-scheme,
// prefers-reduced-motion) unless html[data-theme] or html[data-reduce-motion] says otherwise.
// The text size is the root font size: every type token is in rem, so all text scales
// while layout spacing, in px, stays the same. The last applied choice is cached so the
// next launch starts in the right theme and size before the journal answers.

import type { Preferences, Theme } from '../api/types';
import { DEFAULT_PREFERENCES, isTextScale } from '../domain/preferences';

const APPEARANCE_KEY = 'ttd-appearance-v1';

export type Appearance = Pick<Preferences, 'theme' | 'reduceMotion' | 'textScale'>;

function setAttributes({ theme, reduceMotion, textScale }: Appearance, root: HTMLElement): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  if (reduceMotion) root.setAttribute('data-reduce-motion', 'true');
  else root.removeAttribute('data-reduce-motion');
  root.style.fontSize = textScale === DEFAULT_PREFERENCES.textScale ? '' : `${textScale}%`;
}

export function applyAppearance(appearance: Appearance, root: HTMLElement = document.documentElement): void {
  setAttributes(appearance, root);
  try {
    window.localStorage.setItem(
      APPEARANCE_KEY,
      JSON.stringify({ theme: appearance.theme, reduceMotion: appearance.reduceMotion, textScale: appearance.textScale }),
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
    const textScale = isTextScale(cached.textScale) ? cached.textScale : DEFAULT_PREFERENCES.textScale;
    setAttributes({ theme, reduceMotion: cached.reduceMotion === true, textScale }, root);
  } catch {
    // Ignore an unreadable cache; the system appearance applies until preferences load.
  }
}

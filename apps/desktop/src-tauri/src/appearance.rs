//! The native window follows the theme chosen in the journal's preferences.
//!
//! The interface applies the choice to the page; the title bar and the native dialogs attached
//! to the window (folder and backup pickers) follow it only when the window's own appearance is
//! set. The renderer has no permission to do that, so the shell does it after the preferences
//! change and whenever a journal opens.

use crate::{diagnostics, state::AppState};
use tauri::{AppHandle, Manager, Runtime, Theme};

/// Label of the journal window in `tauri.conf.json`.
pub const MAIN_WINDOW: &str = "main";

/// The native appearance for a stored theme; `None` follows macOS.
pub fn native_theme(theme: &str) -> Option<Theme> {
    match theme {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

/// Applies `theme` to the journal window. On macOS the appearance applies to the whole app,
/// dialogs included.
pub fn apply<R: Runtime>(app: &AppHandle<R>, theme: &str) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    if window.set_theme(native_theme(theme)).is_err() {
        diagnostics::record("apply theme", "unknown");
    }
}

/// Applies the theme stored in the open journal, or the system appearance when no journal is
/// open. It never holds the journal while the window changes.
pub fn apply_stored<R: Runtime>(app: &AppHandle<R>, state: &AppState) {
    let theme = state
        .lock()
        .preferences()
        .map(|preferences| preferences.theme);
    apply(app, theme.as_deref().unwrap_or("system"));
}

#[cfg(test)]
mod tests {
    use super::native_theme;
    use tauri::Theme;

    #[test]
    fn stored_themes_map_to_the_native_appearance() {
        assert_eq!(native_theme("light"), Some(Theme::Light));
        assert_eq!(native_theme("dark"), Some(Theme::Dark));
        // The system choice, and anything unknown, follow macOS.
        assert_eq!(native_theme("system"), None);
        assert_eq!(native_theme("synthetic"), None);
    }
}

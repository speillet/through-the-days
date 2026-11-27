//! Native shell of Through the Days.
//!
//! The renderer reaches the journal only through the commands in `commands.rs`: it never sends
//! filesystem paths or SQL. The journal itself is `journal-core`; this crate adds the
//! application data folder, a single running copy of the installed app, startup and migration,
//! the backup folder and passphrase (native dialogs and Keychain), restore, erasure, the native
//! appearance, metadata-only diagnostics and a quit that waits for pending saves.

mod appearance;
mod commands;
mod diagnostics;
mod error;
mod exit;
mod keychain;
#[cfg(target_os = "macos")]
mod menu;
mod paths;
mod single_instance;
#[cfg(debug_assertions)]
mod smoke;
mod state;

use std::{error::Error, sync::mpsc, thread};
use tauri::{App, Manager};

/// Starts the application.
pub fn run() {
    // First: a second copy of the app must exit before anything else touches the data folder.
    let builder = single_instance::guard(tauri::Builder::default())
        .plugin(tauri_plugin_dialog::init())
        .manage(exit::ExitGate::default())
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            commands::startup_status,
            commands::retry_startup,
            commands::today,
            commands::get_preferences,
            commands::set_preferences,
            commands::entries_on,
            commands::list_entries,
            commands::search_entries,
            commands::reading_report,
            commands::weekly_review,
            commands::save_weekly_notes,
            commands::generate_weekly_summary,
            commands::clear_reading_summaries,
            commands::list_milestones,
            commands::save_milestone,
            commands::delete_milestone,
            commands::save_entry,
            commands::trash_entry,
            commands::list_trash,
            commands::restore_entry,
            commands::delete_entry_permanently,
            commands::purge_expired_trash,
            commands::backup_status,
            commands::choose_backup_folder,
            commands::set_backup_passphrase,
            commands::forget_backup_passphrase,
            commands::backup_now,
            commands::run_daily_backup,
            commands::list_backups,
            commands::choose_restore_file,
            commands::restore_backup,
            commands::migrate_journal,
            commands::erase_app_data,
            commands::confirm_exit,
            commands::cancel_exit,
        ]);
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::build).on_menu_event(menu::on_menu_event);
    #[cfg(debug_assertions)]
    let builder = builder.on_page_load(smoke::on_page_load);
    match builder.build(tauri::generate_context!()) {
        Ok(app) => app.run(exit::on_run_event),
        Err(_) => {
            diagnostics::record("start application", "unknown");
            std::process::exit(1);
        }
    }
}

/// Manages the application state and launches the journal on a background thread.
///
/// The launch thread takes the state's lock before `setup` returns and opens the journal, so
/// every command waits for the journal instead of seeing it half-open. Only then is a remembered
/// passphrase read from Keychain, without holding the journal: a Keychain prompt never keeps
/// the journal from opening or writing from continuing. Publishing a pre-migration backup can
/// also take a while, so the launch never runs on the main thread.
///
/// A second copy of a release build never gets here: the single-instance guard ends it while the
/// app is being built.
fn setup(app: &mut App) -> Result<(), Box<dyn Error>> {
    let platform_dir = app.path().app_data_dir().ok();
    let Some(data_dir) =
        paths::resolve_data_dir(std::env::var_os(paths::DATA_DIR_OVERRIDE), || platform_dir)
    else {
        diagnostics::record("resolve data folder", "storage");
        return Err("The application data folder could not be determined.".into());
    };
    app.manage(state::AppState::new(
        paths::DataPaths::new(data_dir),
        keychain::platform_store(),
    ));
    let handle = app.handle().clone();
    let (locked, wait_until_locked) = mpsc::channel();
    thread::Builder::new()
        .name("journal-launch".into())
        .spawn(move || {
            let state = handle.state::<state::AppState>();
            let pending = state.open_at_launch(chrono::Utc::now(), || {
                let _ = locked.send(());
            });
            appearance::apply_stored(&handle, &state);
            state.finish_launch(pending, chrono::Utc::now());
            // A remembered passphrase may have upgraded an older journal, opening its preferences.
            appearance::apply_stored(&handle, &state);
        })?;
    let _ = wait_until_locked.recv();
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use serde_json::{Value, json};

    /// The renderer listens for events (the quit request and the window's close request) and
    /// destroys its window after flushing; it needs no other Tauri permission. Everything else
    /// goes through the app's own commands.
    #[test]
    fn the_window_may_only_listen_for_events_and_destroy_itself() {
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/main.json")).unwrap();
        assert_eq!(
            capability["permissions"],
            json!(["core:event:default", "core:window:allow-destroy"])
        );
        assert_eq!(capability["windows"], json!(["main"]));
        let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config["app"]["security"]["capabilities"], json!(["main"]));
    }
}

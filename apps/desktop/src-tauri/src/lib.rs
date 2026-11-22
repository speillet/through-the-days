//! Native shell of Through the Days.
//!
//! The renderer reaches the journal only through the commands in `commands.rs`: it never sends
//! filesystem paths or SQL. The journal itself is `journal-core`; this crate adds the
//! application data folder, startup and migration, the backup folder and passphrase (native
//! dialogs and Keychain), restore, erasure, metadata-only diagnostics and a quit that waits for
//! pending saves.

mod commands;
mod diagnostics;
mod error;
mod exit;
mod keychain;
#[cfg(target_os = "macos")]
mod menu;
mod paths;
#[cfg(debug_assertions)]
mod smoke;
mod state;

use std::{error::Error, sync::mpsc, thread};
use tauri::{App, Manager};

/// Starts the application.
pub fn run() {
    let builder = tauri::Builder::default()
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
            commands::get_entry,
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
/// Launching can wait for a Keychain prompt or publish a pre-migration backup, so it never
/// runs on the main thread. The launch thread takes the state's lock before `setup` returns,
/// which makes every command wait for the launch outcome instead of seeing a half-open journal.
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
            let mut core = state.lock();
            let _ = locked.send(());
            core.launch(chrono::Utc::now());
        })?;
    let _ = wait_until_locked.recv();
    Ok(())
}

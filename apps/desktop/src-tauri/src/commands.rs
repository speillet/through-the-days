//! Tauri commands: thin adapters from the renderer's `invoke` calls to [`Core`].
//!
//! Names and camelCase arguments follow the command table of the integration contract and
//! `apps/desktop/src/api/tauri.ts`. Every command except `confirm_exit` runs on the blocking
//! thread pool, never on the main thread: journal work can wait for a backup that holds the
//! journal, scrypt takes about a second, and native dialogs block until they are answered.
//! A rejected command is recorded in diagnostics by name and error code only.

use crate::{
    diagnostics,
    error::CommandError,
    exit,
    state::{
        AppState, BackupStatus, Core, PickedBackup, RestoreOutcome, RestoreSource, StartupStatus,
    },
};
use chrono::Utc;
use journal_core::{BackupRecord, Entry, Error, Preferences, TrashItem};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
use zeroize::Zeroizing;

/// Runs `work` on the blocking pool with the application state.
async fn blocking<T, F>(app: AppHandle, operation: &'static str, work: F) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle, &AppState) -> Result<T, CommandError> + Send + 'static,
{
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app
            .try_state::<AppState>()
            .ok_or_else(CommandError::not_ready)?;
        work(&app, &state)
    })
    .await
    .unwrap_or_else(|_| Err(CommandError::unknown()));
    if let Err(error) = &result {
        diagnostics::record(operation, error.code);
    }
    result
}

/// Runs `work` on the blocking pool while holding [`Core`].
async fn with_core<T, F>(
    app: AppHandle,
    operation: &'static str,
    work: F,
) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(&mut Core) -> Result<T, CommandError> + Send + 'static,
{
    blocking(app, operation, move |_, state| work(&mut state.lock())).await
}

/// A native file dialog attached to the journal window when it is open.
fn file_dialog(app: &AppHandle, title: &str) -> FileDialogBuilder<tauri::Wry> {
    let dialog = app.dialog().file().set_title(title);
    match app.get_webview_window("main") {
        Some(window) => dialog.set_parent(&window),
        None => dialog,
    }
}

#[tauri::command]
pub async fn startup_status(app: AppHandle) -> Result<StartupStatus, CommandError> {
    with_core(app, "startup_status", |core| Ok(core.startup_status())).await
}

#[tauri::command]
pub async fn today(app: AppHandle) -> Result<String, CommandError> {
    with_core(app, "today", |core| core.today(Utc::now())).await
}

#[tauri::command]
pub async fn get_preferences(app: AppHandle) -> Result<Preferences, CommandError> {
    with_core(app, "get_preferences", |core| core.preferences()).await
}

#[tauri::command]
pub async fn set_preferences(
    app: AppHandle,
    preferences: Value,
) -> Result<Preferences, CommandError> {
    with_core(app, "set_preferences", move |core| {
        core.set_preferences(preferences)
    })
    .await
}

#[tauri::command]
pub async fn entries_on(app: AppHandle, date: String) -> Result<Vec<Entry>, CommandError> {
    with_core(app, "entries_on", move |core| core.entries_on(&date)).await
}

#[tauri::command]
pub async fn list_entries(app: AppHandle) -> Result<Vec<Entry>, CommandError> {
    with_core(app, "list_entries", |core| core.list_entries()).await
}

#[tauri::command]
pub async fn get_entry(app: AppHandle, id: String) -> Result<Entry, CommandError> {
    with_core(app, "get_entry", move |core| core.get_entry(&id)).await
}

#[tauri::command]
pub async fn save_entry(app: AppHandle, entry: Value) -> Result<Entry, CommandError> {
    with_core(app, "save_entry", move |core| core.save_entry(entry)).await
}

#[tauri::command]
pub async fn trash_entry(app: AppHandle, id: String, revision: u32) -> Result<(), CommandError> {
    with_core(app, "trash_entry", move |core| {
        core.trash_entry(&id, revision, Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn list_trash(app: AppHandle) -> Result<Vec<TrashItem>, CommandError> {
    with_core(app, "list_trash", |core| core.list_trash()).await
}

#[tauri::command]
pub async fn restore_entry(app: AppHandle, id: String) -> Result<Entry, CommandError> {
    with_core(app, "restore_entry", move |core| core.restore_entry(&id)).await
}

#[tauri::command]
pub async fn delete_entry_permanently(app: AppHandle, id: String) -> Result<(), CommandError> {
    with_core(app, "delete_entry_permanently", move |core| {
        core.delete_entry_permanently(&id)
    })
    .await
}

#[tauri::command]
pub async fn purge_expired_trash(app: AppHandle) -> Result<(), CommandError> {
    with_core(app, "purge_expired_trash", |core| {
        core.purge_expired_trash(Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn backup_status(app: AppHandle) -> Result<BackupStatus, CommandError> {
    with_core(app, "backup_status", |core| {
        Ok(core.backup_status(Utc::now()))
    })
    .await
}

/// Opens the native folder dialog; cancelling leaves the status unchanged.
#[tauri::command]
pub async fn choose_backup_folder(app: AppHandle) -> Result<BackupStatus, CommandError> {
    blocking(app, "choose_backup_folder", |app, state| {
        // The dialog is answered without holding the journal.
        let picked = file_dialog(app, "Choose a backup folder").blocking_pick_folder();
        let folder = picked
            .map(|path| path.into_path())
            .transpose()
            .map_err(|_| Error::Backup)?;
        let mut core = state.lock();
        match folder {
            Some(folder) => core.set_backup_folder(folder, Utc::now()),
            None => Ok(core.backup_status(Utc::now())),
        }
    })
    .await
}

#[tauri::command]
pub async fn set_backup_passphrase(
    app: AppHandle,
    passphrase: String,
    remember: bool,
) -> Result<BackupStatus, CommandError> {
    let passphrase = Zeroizing::new(passphrase);
    with_core(app, "set_backup_passphrase", move |core| {
        core.set_backup_passphrase(passphrase, remember, Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn forget_backup_passphrase(app: AppHandle) -> Result<BackupStatus, CommandError> {
    with_core(app, "forget_backup_passphrase", |core| {
        core.forget_backup_passphrase(Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn backup_now(app: AppHandle) -> Result<BackupStatus, CommandError> {
    with_core(app, "backup_now", |core| core.backup_now(Utc::now())).await
}

#[tauri::command]
pub async fn run_daily_backup(app: AppHandle) -> Result<BackupStatus, CommandError> {
    with_core(app, "run_daily_backup", |core| {
        core.run_daily_backup(Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn list_backups(app: AppHandle) -> Result<Vec<BackupRecord>, CommandError> {
    with_core(app, "list_backups", |core| core.list_backups()).await
}

/// Opens the native open dialog for `.age` backups; native state keeps the chosen path.
#[tauri::command]
pub async fn choose_restore_file(app: AppHandle) -> Result<Option<PickedBackup>, CommandError> {
    blocking(app, "choose_restore_file", |app, state| {
        let start = state.lock().backup_folder();
        let mut dialog = file_dialog(app, "Choose a backup to restore")
            .add_filter("Through the Days backup", &["age"]);
        if let Some(folder) = start {
            dialog = dialog.set_directory(folder);
        }
        let picked = dialog
            .blocking_pick_file()
            .and_then(|path| path.into_path().ok());
        Ok(state.lock().pick_restore_file(picked))
    })
    .await
}

#[tauri::command]
pub async fn restore_backup(
    app: AppHandle,
    source: RestoreSource,
    passphrase: String,
) -> Result<RestoreOutcome, CommandError> {
    let passphrase = Zeroizing::new(passphrase);
    with_core(app, "restore_backup", move |core| {
        core.restore_backup(source, passphrase, Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn migrate_journal(
    app: AppHandle,
    passphrase: String,
    remember: bool,
) -> Result<StartupStatus, CommandError> {
    let passphrase = Zeroizing::new(passphrase);
    with_core(app, "migrate_journal", move |core| {
        core.migrate_journal(passphrase, remember, Utc::now())
    })
    .await
}

#[tauri::command]
pub async fn erase_app_data(
    app: AppHandle,
    confirmation: String,
) -> Result<StartupStatus, CommandError> {
    with_core(app, "erase_app_data", move |core| {
        core.erase_app_data(&confirmation, Utc::now())
    })
    .await
}

/// Called by the renderer once pending saves are flushed after `app://flush-request`.
#[tauri::command]
pub fn confirm_exit(app: AppHandle) -> Result<(), CommandError> {
    exit::confirm_and_exit(&app);
    Ok(())
}

/// The renderer and the shell are built separately, so a renamed command or argument would only
/// fail inside the running app. These checks read both sources and compare them.
#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    type Commands = BTreeMap<String, BTreeSet<String>>;

    /// Commands invoked by `apps/desktop/src/api/tauri.ts`, with their argument names.
    fn renderer_calls() -> Commands {
        let source = include_str!("../../src/api/tauri.ts");
        let mut calls = Commands::new();
        for (index, _) in source.match_indices("call<") {
            let rest = &source[index..];
            let paren = rest.find('(').unwrap();
            // Skip the helper's own definition, `call<T>(command, …)`.
            if !rest[..paren].ends_with('>') || !rest[paren + 1..].starts_with('\'') {
                continue;
            }
            let open = paren + 2;
            let close = open + rest[open..].find('\'').unwrap();
            let after = rest[close + 1..].trim_start();
            let arguments = match after.strip_prefix(',') {
                Some(object) => {
                    let object = object.trim_start().strip_prefix('{').unwrap();
                    object[..object.find('}').unwrap()]
                        .split(',')
                        .filter_map(|argument| argument.split(':').next())
                        .map(str::trim)
                        .filter(|argument| !argument.is_empty())
                        .map(str::to_owned)
                        .collect()
                }
                None => BTreeSet::new(),
            };
            calls.insert(rest[open..close].to_owned(), arguments);
        }
        calls
    }

    /// The shell's commands with their argument names as the renderer must send them.
    fn native_commands() -> Commands {
        let source = include_str!("commands.rs");
        source
            .split(concat!("#[tauri::", "command]"))
            .skip(1)
            .map(|segment| {
                let start = segment.find("fn ").unwrap() + 3;
                let open = start + segment[start..].find('(').unwrap();
                let close = open + segment[open..].find(')').unwrap();
                let arguments = segment[open + 1..close]
                    .split(',')
                    .filter_map(|parameter| parameter.split(':').next())
                    .map(str::trim)
                    .filter(|parameter| !parameter.is_empty() && *parameter != "app")
                    .map(camel_case)
                    .collect();
                (segment[start..open].trim().to_owned(), arguments)
            })
            .collect()
    }

    /// Commands registered with `generate_handler!` in `lib.rs`.
    fn registered() -> BTreeSet<String> {
        let source = include_str!("lib.rs");
        let start = source.find("generate_handler![").unwrap();
        let end = start + source[start..].find(']').unwrap();
        source[start..end]
            .split("commands::")
            .skip(1)
            .map(|item| {
                item.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
                    .next()
                    .unwrap()
                    .to_owned()
            })
            .collect()
    }

    /// Tauri's default mapping of a Rust parameter name to its JavaScript key.
    fn camel_case(name: &str) -> String {
        let mut words = name.split('_');
        let first = words.next().unwrap_or_default().to_owned();
        words.fold(first, |mut key, word| {
            let mut letters = word.chars();
            if let Some(initial) = letters.next() {
                key.extend(initial.to_uppercase());
                key.push_str(letters.as_str());
            }
            key
        })
    }

    #[test]
    fn every_command_is_registered_and_called_with_its_argument_names() {
        let native = native_commands();
        assert_eq!(native.len(), 25);
        assert_eq!(registered(), native.keys().cloned().collect());
        assert_eq!(renderer_calls(), native);
    }

    #[test]
    fn parameters_map_to_camel_case_keys() {
        assert_eq!(camel_case("passphrase"), "passphrase");
        assert_eq!(camel_case("backup_folder_name"), "backupFolderName");
    }
}

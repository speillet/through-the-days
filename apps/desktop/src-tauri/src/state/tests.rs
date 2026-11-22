//! Flow tests of the native application state, at the interface the commands use.
//!
//! They run real temporary journals with synthetic, fictional entries and an in-memory
//! Keychain; nothing here touches the real data folder or the login Keychain. Published backups
//! use journal-core's calibrated scrypt cost, about a second per encryption or decryption.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a failed unwrap is a failed test"
)]

use super::{
    AppState, Core, ERASE_CONFIRMATION, OPEN_FAILED, RestoreOutcome, RestoreSource, StartupState,
    backup::BackupState,
};
use crate::{error::CommandError, keychain::fake::FakeKeychain, paths::DataPaths};
use chrono::{DateTime, Duration, TimeZone, Utc};
use journal_core::{BackupPlan, Entry, Error, Journal, Slot, document_text, list_backups};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tempfile::TempDir;
use zeroize::Zeroizing;

const PASSPHRASE: &str = "synthetic portable backup passphrase";

/// A data folder, a backup folder and a Keychain, all private to one test.
struct Fixture {
    data: TempDir,
    backups: TempDir,
    keychain: FakeKeychain,
}

impl Fixture {
    fn new() -> Self {
        Self {
            data: tempfile::tempdir().unwrap(),
            backups: tempfile::tempdir().unwrap(),
            keychain: FakeKeychain::default(),
        }
    }

    fn with_keychain(keychain: FakeKeychain) -> Self {
        Self {
            keychain,
            ..Self::new()
        }
    }

    /// A nested data folder, so launch must create it.
    fn paths(&self) -> DataPaths {
        DataPaths::new(
            self.data
                .path()
                .join("Application Support")
                .join("synthetic"),
        )
    }

    fn folder(&self) -> PathBuf {
        self.backups.path().to_path_buf()
    }

    fn launch(&self) -> Core {
        self.launch_at(noon())
    }

    fn launch_at(&self, now: DateTime<Utc>) -> Core {
        let mut core = Core::new(self.paths(), Box::new(self.keychain.clone()));
        core.launch(now);
        core
    }

    fn stored_plan(&self) -> BackupPlan {
        BackupPlan::load(&self.paths().plan).unwrap()
    }

    fn store_plan(&self, plan: &BackupPlan) {
        fs::create_dir_all(&self.paths().data_dir).unwrap();
        plan.store(&self.paths().plan).unwrap();
    }

    fn journal_bytes(&self) -> Vec<u8> {
        fs::read(self.paths().journal).unwrap()
    }
}

/// 22 November 2026 at noon in Paris, the default journal time zone.
fn noon() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 22, 11, 0, 0).unwrap()
}

fn secret(text: &str) -> Zeroizing<String> {
    Zeroizing::new(text.to_owned())
}

fn document(text: &str) -> Value {
    json!({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]})
}

/// A new draft as the renderer sends it.
fn draft(date: &str, slot: Slot, text: &str) -> Value {
    let mut entry = Entry::draft(date, slot);
    entry.document = document(text);
    serde_json::to_value(entry).unwrap()
}

fn edited(entry: &Entry, text: &str) -> Value {
    let mut entry = entry.clone();
    entry.document = document(text);
    serde_json::to_value(entry).unwrap()
}

fn text_of(entry: &Entry) -> String {
    document_text(&entry.document)
}

fn execute(path: &Path, sql: &str) {
    rusqlite::Connection::open(path)
        .unwrap()
        .execute_batch(sql)
        .unwrap();
}

/// Writes a fictional schema-version-1 journal with one Morning entry and returns its id.
/// Version 1 had no trash column and no perceived progress.
fn previous_journal(path: &Path) -> String {
    execute(
        path,
        "CREATE TABLE journal_entries(id TEXT PRIMARY KEY,entry_date TEXT NOT NULL,slot TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL);
         CREATE UNIQUE INDEX active_slot ON journal_entries(entry_date,slot);
         CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
         PRAGMA user_version=1;",
    );
    let mut entry = Entry::draft("2026-11-20", Slot::Morning);
    entry.revision = 1;
    entry.document = document("Synthetic entry from the previous version.");
    let mut payload = serde_json::to_value(&entry).unwrap();
    payload.as_object_mut().unwrap().remove("progress");
    rusqlite::Connection::open(path)
        .unwrap()
        .execute(
            "INSERT INTO journal_entries VALUES(?1,?2,'morning',1,?3)",
            rusqlite::params![entry.id, entry.date, payload.to_string()],
        )
        .unwrap();
    entry.id
}

fn newer_journal(path: &Path) {
    execute(
        path,
        "CREATE TABLE journal_entries(id TEXT PRIMARY KEY,entry_date TEXT NOT NULL,slot TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,trashed_at INTEGER NULL);
         CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
         PRAGMA user_version=99;",
    );
}

fn foreign_database(path: &Path) {
    execute(
        path,
        "CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT); PRAGMA user_version=3;",
    );
}

fn names_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<_> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

fn ready_with_backups(fixture: &Fixture) -> Core {
    let mut core = fixture.launch();
    core.set_backup_folder(fixture.folder(), noon()).unwrap();
    core.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    core
}

/// Registers `count` newer stand-in files, so the folder's retention window is full (D-009).
/// They are never decrypted: pruning only checks the digest of files it deletes.
fn register_stand_ins(folder: &Path, after: i64, count: i64) {
    let registry_path = folder.join(".through-the-days-backups.json");
    let mut registry: Value = serde_json::from_slice(&fs::read(&registry_path).unwrap()).unwrap();
    let backups = registry["backups"].as_array_mut().unwrap();
    for index in 1..=count {
        let created_at = after + index;
        let name = format!("ttd-{created_at}-synthetic-stand-in.ttd.age");
        fs::write(folder.join(&name), b"synthetic stand-in").unwrap();
        backups.push(json!({"name": name, "createdAt": created_at, "sha256": "0".repeat(64)}));
    }
    fs::write(registry_path, serde_json::to_vec(&registry).unwrap()).unwrap();
}

#[test]
fn first_launch_opens_an_empty_journal_and_asks_for_a_backup_folder() {
    let fixture = Fixture::new();
    let core = fixture.launch();
    let location = fixture.paths().data_dir.display().to_string();
    assert_eq!(
        serde_json::to_value(core.startup_status()).unwrap(),
        json!({"state": "ready", "fromVersion": null, "message": null, "dataLocation": location})
    );
    assert!(fixture.paths().journal.is_file());
    assert_eq!(core.today(noon()).unwrap(), "2026-11-22");
    assert!(core.list_entries().unwrap().is_empty());
    assert!(core.list_backups().unwrap().is_empty());
    assert_eq!(
        serde_json::to_value(core.backup_status(noon())).unwrap(),
        json!({
            "state": "needsFolder", "folderName": null, "folderPath": null,
            "passphraseAvailable": false, "remembered": false, "lastSuccessDate": null,
            "lastSuccessAt": null, "lastError": null, "retentionWarning": false, "backupCount": 0
        })
    );
}

#[test]
fn acknowledged_entries_and_preferences_survive_a_new_session() {
    let fixture = Fixture::new();
    let core = fixture.launch();
    // Multilingual fixture: user-authored text is stored exactly as typed.
    let text = "Synthetic morning note. Multilingual fixture: café, ελληνικά, 日本語.";
    let saved = core
        .save_entry(draft("2026-11-22", Slot::Morning, text))
        .unwrap();
    assert_eq!(saved.revision, 1);
    let mut preferences = serde_json::to_value(core.preferences().unwrap()).unwrap();
    preferences["timeZone"] = json!("America/New_York");
    preferences["theme"] = json!("dark");
    assert_eq!(core.set_preferences(preferences).unwrap().theme, "dark");
    drop(core);

    let core = fixture.launch();
    let reopened = core.get_entry(&saved.id).unwrap();
    assert_eq!(text_of(&reopened), text);
    assert_eq!(core.entries_on("2026-11-22").unwrap(), vec![saved]);
    assert_eq!(core.preferences().unwrap().theme, "dark");
    // 03:00 UTC on 23 November is still 22 November in the journal's time zone.
    let late = Utc.with_ymd_and_hms(2026, 11, 23, 3, 0, 0).unwrap();
    assert_eq!(core.today(late).unwrap(), "2026-11-22");
}

#[test]
fn malformed_input_is_refused_with_english_errors_and_changes_nothing() {
    let fixture = Fixture::new();
    let core = fixture.launch();
    let saved = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Evening,
            "Synthetic evening note.",
        ))
        .unwrap();
    let entry = serde_json::to_value(&saved).unwrap();
    for (field, value, code) in [
        ("mood", json!(2.5), "score"),
        ("energy", json!("high"), "score"),
        ("pride", json!(11), "score"),
        ("progress", json!(0), "score"),
        ("emotion", json!("synthetic-unknown-emotion"), "emotion"),
        ("date", json!("22/11/2026"), "date"),
        ("unexpected", json!(true), "document"),
    ] {
        let mut attempt = entry.clone();
        attempt[field] = value;
        let error = core.save_entry(attempt).unwrap_err();
        assert_eq!(error.code, code, "{field}");
        assert!(error.message.ends_with('.'), "{field}");
    }
    assert_eq!(core.get_entry(&saved.id).unwrap(), saved);
    let mut preferences = serde_json::to_value(core.preferences().unwrap()).unwrap();
    preferences["timeZone"] = json!("Synthetic/Nowhere");
    assert_eq!(core.set_preferences(preferences).unwrap_err().code, "date");
    assert_eq!(core.entries_on("2026-02-30").unwrap_err().code, "date");

    let mut valid = entry;
    valid["mood"] = json!(0);
    valid["energy"] = json!(10);
    assert_eq!(core.save_entry(valid).unwrap().revision, 2);
}

#[test]
fn trash_restores_free_slots_and_reports_occupied_ones() {
    let fixture = Fixture::new();
    let core = fixture.launch();
    let first = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "First synthetic morning.",
        ))
        .unwrap();
    core.trash_entry(&first.id, first.revision, noon()).unwrap();
    let trash = core.list_trash().unwrap();
    assert_eq!(trash.len(), 1);
    assert_eq!(trash[0].deleted_at, noon().timestamp());
    assert_eq!(trash[0].expires_at, noon().timestamp() + 30 * 86_400);

    let replacement = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Replacement synthetic morning.",
        ))
        .unwrap();
    assert_eq!(
        core.restore_entry(&first.id, noon()).unwrap_err().code,
        "occupied"
    );
    core.delete_entry_permanently(&first.id).unwrap();
    assert!(core.list_trash().unwrap().is_empty());
    assert_eq!(
        core.delete_entry_permanently(&first.id).unwrap_err().code,
        "notFound"
    );
    assert_eq!(core.list_entries().unwrap(), vec![replacement]);
}

#[test]
fn expired_trash_is_purged_when_the_journal_opens() {
    let fixture = Fixture::new();
    let core = fixture.launch();
    let entry = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Evening,
            "Synthetic entry to delete.",
        ))
        .unwrap();
    core.trash_entry(&entry.id, entry.revision, noon()).unwrap();
    drop(core);
    let core = fixture.launch_at(noon() + Duration::days(30) - Duration::seconds(1));
    assert_eq!(core.list_trash().unwrap().len(), 1);
    drop(core);
    let core = fixture.launch_at(noon() + Duration::days(30));
    assert!(core.list_trash().unwrap().is_empty());
}

#[test]
fn an_older_journal_waits_for_its_protected_upgrade_without_being_changed() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.paths().data_dir).unwrap();
    let id = previous_journal(&fixture.paths().journal);
    let original = fixture.journal_bytes();
    let mut core = fixture.launch();
    let startup = core.startup_status();
    assert_eq!(startup.state, StartupState::NeedsMigration);
    assert_eq!(startup.from_version, Some(1));
    assert_eq!(startup.message, None);

    // The journal waits for the upgrade; backup settings stay available.
    let waiting = [
        core.list_entries().unwrap_err(),
        core.save_entry(draft("2026-11-22", Slot::Morning, "Synthetic."))
            .unwrap_err(),
        core.run_daily_backup(noon()).unwrap_err(),
        core.backup_now(noon()).unwrap_err(),
    ];
    assert!(
        waiting
            .iter()
            .all(|error| *error == CommandError::not_ready())
    );
    assert_eq!(core.backup_status(noon()).state, BackupState::NeedsFolder);
    let error = core
        .migrate_journal(secret(PASSPHRASE), false, noon())
        .unwrap_err();
    assert_eq!(error.code, "needsFolder");
    core.set_backup_folder(fixture.folder(), noon()).unwrap();
    let error = core
        .migrate_journal(secret("too short"), false, noon())
        .unwrap_err();
    assert_eq!(error.code, "passphrase");
    assert_eq!(fixture.journal_bytes(), original);

    let startup = core
        .migrate_journal(secret(PASSPHRASE), false, noon())
        .unwrap();
    assert_eq!(startup.state, StartupState::Ready);
    assert_eq!(startup.from_version, None);
    let entry = core.get_entry(&id).unwrap();
    assert_eq!(entry.progress, None);
    assert_eq!(
        text_of(&entry),
        "Synthetic entry from the previous version."
    );
    assert_eq!(list_backups(&fixture.folder()).unwrap().len(), 1);
    let status = core.backup_status(noon());
    assert!(status.passphrase_available);
    assert!(!status.remembered);
    assert_eq!(fixture.keychain.contents().item, None);
    // Asking again after the upgrade changes nothing.
    let again = core
        .migrate_journal(secret(PASSPHRASE), false, noon())
        .unwrap();
    assert_eq!(again, startup);
}

#[test]
fn startup_restore_validates_before_keeping_the_unreadable_journal_aside() {
    let source = Fixture::new();
    let mut original = ready_with_backups(&source);
    let entry = original
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic recoverable writing.",
        ))
        .unwrap();
    original.backup_now(noon()).unwrap();
    let backup = source
        .folder()
        .join(original.list_backups().unwrap().remove(0).name);
    let target = Fixture::new();
    fs::create_dir_all(&target.paths().data_dir).unwrap();
    fs::write(&target.paths().journal, b"synthetic damaged SQLite header").unwrap();
    let before = target.journal_bytes();
    let mut core = target.launch();
    assert_eq!(core.startup_status().state, StartupState::Failed);
    core.pick_restore_file(Some(backup));
    assert!(
        core.restore_backup(
            RestoreSource::Picked,
            secret("synthetic wrong passphrase"),
            false,
            noon()
        )
        .is_err()
    );
    assert_eq!(target.journal_bytes(), before);
    let outcome = core
        .restore_backup(RestoreSource::Picked, secret(PASSPHRASE), false, noon())
        .unwrap();
    assert_eq!(core.startup_status().state, StartupState::Ready);
    assert_eq!(core.get_entry(&entry.id).unwrap(), entry);
    let recovery = target.paths().data_dir.join(outcome.set_aside.unwrap());
    assert_eq!(fs::read(recovery.join("journal.sqlite")).unwrap(), before);
    assert!(!outcome.safety_backup);
}

#[test]
fn retrying_a_failed_start_reopens_the_original_path_without_resetting_it() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.paths().data_dir).unwrap();
    fs::write(&fixture.paths().journal, b"synthetic damaged file").unwrap();
    let mut core = fixture.launch();
    assert_eq!(core.retry_startup(noon()).state, StartupState::Failed);
    fs::remove_file(&fixture.paths().journal).unwrap();
    assert_eq!(core.retry_startup(noon()).state, StartupState::Ready);
    let saved = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic retry writing.",
        ))
        .unwrap();
    assert_eq!(core.retry_startup(noon()).state, StartupState::Ready);
    assert_eq!(core.get_entry(&saved.id).unwrap(), saved);
}

#[test]
fn unreadable_backup_settings_stay_visible_until_a_folder_is_chosen() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.paths().data_dir).unwrap();
    fs::write(&fixture.paths().plan, b"synthetic invalid backup settings").unwrap();
    let mut core = fixture.launch();
    assert_eq!(
        core.backup_status(noon()).state,
        BackupState::SettingsUnreadable
    );
    core.run_daily_backup(noon()).unwrap();
    assert_eq!(
        fs::read(&fixture.paths().plan).unwrap(),
        b"synthetic invalid backup settings"
    );
    core.set_backup_folder(fixture.folder(), noon()).unwrap();
    assert_eq!(
        core.backup_status(noon()).state,
        BackupState::NeedsPassphrase
    );
}

#[test]
fn an_older_journal_upgrades_at_launch_when_its_backup_can_be_made() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    fixture.store_plan(&BackupPlan {
        folder: Some(fixture.folder()),
        remember: true,
        ..BackupPlan::default()
    });
    let id = previous_journal(&fixture.paths().journal);
    let core = fixture.launch();
    assert_eq!(core.startup_status().state, StartupState::Ready);
    assert_eq!(
        text_of(&core.get_entry(&id).unwrap()),
        "Synthetic entry from the previous version."
    );
    assert_eq!(list_backups(&fixture.folder()).unwrap().len(), 1);
}

#[test]
fn an_upgrade_that_cannot_back_up_at_launch_waits_with_an_explanation() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    fixture.store_plan(&BackupPlan {
        folder: Some(fixture.backups.path().join("unplugged synthetic drive")),
        remember: true,
        ..BackupPlan::default()
    });
    previous_journal(&fixture.paths().journal);
    let original = fixture.journal_bytes();
    let core = fixture.launch();
    let startup = core.startup_status();
    assert_eq!(startup.state, StartupState::NeedsMigration);
    assert_eq!(startup.from_version, Some(1));
    assert_eq!(startup.message, Some(Error::BackupFolder.to_string()));
    assert_eq!(fixture.journal_bytes(), original);
}

#[test]
fn newer_or_foreign_databases_are_unsupported_and_left_unchanged_until_erased() {
    for create in [newer_journal as fn(&Path), foreign_database] {
        let fixture = Fixture::new();
        fs::create_dir_all(&fixture.paths().data_dir).unwrap();
        create(&fixture.paths().journal);
        let original = fixture.journal_bytes();
        let mut core = fixture.launch();
        let startup = core.startup_status();
        assert_eq!(startup.state, StartupState::Unsupported);
        assert_eq!(startup.message, Some(Error::Unsupported.to_string()));
        assert_eq!(core.today(noon()).unwrap_err(), CommandError::not_ready());
        assert_eq!(fixture.journal_bytes(), original);
        // Erasing application data is the way back to a usable, empty journal.
        let startup = core.erase_app_data(ERASE_CONFIRMATION, noon()).unwrap();
        assert_eq!(startup.state, StartupState::Ready);
        assert!(core.list_entries().unwrap().is_empty());
    }
}

#[test]
fn an_unusable_data_folder_reports_a_failed_start() {
    let fixture = Fixture::new();
    let data_dir = fixture.paths().data_dir;
    fs::create_dir_all(data_dir.parent().unwrap()).unwrap();
    fs::write(&data_dir, b"synthetic file where the data folder belongs").unwrap();
    let core = fixture.launch();
    let startup = core.startup_status();
    assert_eq!(startup.state, StartupState::Failed);
    assert_eq!(startup.message.as_deref(), Some(OPEN_FAILED));
    assert_eq!(core.list_entries().unwrap_err(), CommandError::not_ready());
}

#[test]
fn backup_status_follows_the_folder_passphrase_and_todays_result() {
    let fixture = Fixture::new();
    let mut core = fixture.launch();
    assert_eq!(core.backup_now(noon()).unwrap_err().code, "needsFolder");
    assert_eq!(
        core.run_daily_backup(noon()).unwrap().state,
        BackupState::NeedsFolder
    );

    let status = core.set_backup_folder(fixture.folder(), noon()).unwrap();
    assert_eq!(status.state, BackupState::NeedsPassphrase);
    assert_eq!(
        status.folder_path,
        Some(fixture.folder().display().to_string())
    );
    assert_eq!(
        status.folder_name.as_deref(),
        fixture.folder().file_name().and_then(|name| name.to_str())
    );
    assert_eq!(fixture.stored_plan().folder, Some(fixture.folder()));
    assert_eq!(core.backup_now(noon()).unwrap_err().code, "needsPassphrase");
    // A due backup without its passphrase is pending, not an error, and writing continues.
    assert_eq!(
        core.run_daily_backup(noon()).unwrap().state,
        BackupState::NeedsPassphrase
    );
    let entry = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic entry worth keeping.",
        ))
        .unwrap();
    let error = core
        .set_backup_passphrase(secret("eleven char"), false, noon())
        .unwrap_err();
    assert_eq!(error.code, "passphrase");

    let status = core
        .set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    assert_eq!(status.state, BackupState::Due);
    assert!(status.passphrase_available && !status.remembered);

    let status = core.run_daily_backup(noon()).unwrap();
    assert_eq!(status.state, BackupState::UpToDate);
    assert_eq!(status.last_success_date.as_deref(), Some("2026-11-22"));
    assert_eq!(status.last_success_at, Some(noon().timestamp()));
    assert_eq!(status.last_error, None);
    assert_eq!(status.backup_count, 1);
    assert_eq!(
        fixture.stored_plan().last_success_date.as_deref(),
        Some("2026-11-22")
    );
    // Later the same day nothing new is published.
    let later = core.run_daily_backup(noon() + Duration::hours(3)).unwrap();
    assert_eq!(later, status);
    assert_eq!(core.list_backups().unwrap().len(), 1);
    assert_eq!(core.get_entry(&entry.id).unwrap(), entry);
}

#[test]
fn a_failed_backup_stays_visible_until_the_settings_change() {
    let fixture = Fixture::new();
    fixture.store_plan(&BackupPlan {
        folder: Some(fixture.backups.path().join("unplugged synthetic drive")),
        last_success_date: Some("2026-11-21".into()),
        last_success_at: Some(noon().timestamp() - 86_400),
        retention_warning: true,
        ..BackupPlan::default()
    });
    let mut core = fixture.launch();
    core.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    let status = core.run_daily_backup(noon()).unwrap();
    assert_eq!(status.state, BackupState::Failed);
    assert_eq!(
        status.last_error,
        Some(CommandError::from(Error::BackupFolder))
    );
    assert_eq!(status.last_success_date.as_deref(), Some("2026-11-21"));
    assert_eq!(core.backup_now(noon()).unwrap_err().code, "backupFolder");
    // No success is recorded for a failed attempt.
    assert_eq!(
        fixture.stored_plan().last_success_date.as_deref(),
        Some("2026-11-21")
    );

    // Results that described the previous folder are forgotten with it.
    let status = core.set_backup_folder(fixture.folder(), noon()).unwrap();
    assert_eq!(status.state, BackupState::Due);
    assert_eq!(status.last_error, None);
    assert_eq!(status.last_success_date, None);
    assert_eq!(status.last_success_at, None);
    assert!(!status.retention_warning);
    // Choosing the same folder again changes nothing.
    assert_eq!(
        core.set_backup_folder(fixture.folder(), noon()).unwrap(),
        status
    );
}

#[test]
fn the_passphrase_is_remembered_only_when_asked() {
    let fixture = Fixture::new();
    let mut core = fixture.launch();
    let status = core
        .set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    assert!(status.remembered && status.passphrase_available);
    assert_eq!(
        fixture.keychain.contents().item.as_deref(),
        Some(PASSPHRASE)
    );
    assert!(fixture.stored_plan().remember);
    drop(core);
    let mut core = fixture.launch();
    assert!(core.backup_status(noon()).passphrase_available);

    // Declining Keychain storage keeps a new passphrase for this session only.
    let status = core
        .set_backup_passphrase(secret("another synthetic passphrase"), false, noon())
        .unwrap();
    assert!(status.passphrase_available && !status.remembered);
    assert_eq!(fixture.keychain.contents().item, None);
    drop(core);
    let mut core = fixture.launch();
    let status = core.backup_status(noon());
    assert!(!status.passphrase_available && !status.remembered);
    assert_eq!(core.startup_status().state, StartupState::Ready);

    core.set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    let status = core.forget_backup_passphrase(noon()).unwrap();
    assert!(!status.passphrase_available && !status.remembered);
    assert_eq!(fixture.keychain.contents().item, None);
    assert!(!fixture.stored_plan().remember);
}

#[test]
fn a_keychain_failure_keeps_the_session_passphrase_and_writing_available() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    fixture.store_plan(&BackupPlan {
        remember: true,
        ..BackupPlan::default()
    });
    fixture.keychain.contents().failing = true;
    let mut core = fixture.launch();
    assert_eq!(core.startup_status().state, StartupState::Ready);
    assert!(!core.backup_status(noon()).passphrase_available);

    let error = core
        .set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap_err();
    assert_eq!(error, CommandError::keychain());
    let status = core.backup_status(noon());
    assert!(status.passphrase_available);
    assert!(!status.remembered);
    assert!(!fixture.stored_plan().remember);

    let error = core.forget_backup_passphrase(noon()).unwrap_err();
    assert_eq!(error, CommandError::keychain());
    assert!(!core.backup_status(noon()).passphrase_available);
    core.save_entry(draft("2026-11-22", Slot::Evening, "Synthetic note."))
        .unwrap();
}

#[test]
fn a_remembered_passphrase_that_is_gone_is_no_longer_reported_as_remembered() {
    let fixture = Fixture::new();
    fixture.store_plan(&BackupPlan {
        remember: true,
        ..BackupPlan::default()
    });
    let core = fixture.launch();
    let status = core.backup_status(noon());
    assert!(!status.passphrase_available && !status.remembered);
}

#[test]
fn restore_publishes_a_safety_backup_first_and_brings_back_the_backed_up_journal() {
    let fixture = Fixture::new();
    let mut core = ready_with_backups(&fixture);
    let kept = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic entry in the backup.",
        ))
        .unwrap();
    core.backup_now(noon()).unwrap();
    let backup = core.list_backups().unwrap().remove(0);
    core.save_entry(edited(&kept, "Synthetic edit made after the backup."))
        .unwrap();
    let later = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Evening,
            "Synthetic entry after the backup.",
        ))
        .unwrap();

    // Only registered backups of the chosen folder, or a picked file, can be restored.
    for source in [
        RestoreSource::Registered {
            name: "../synthetic/journal.sqlite".into(),
        },
        RestoreSource::Registered {
            name: "ttd-1-unregistered.ttd.age".into(),
        },
        RestoreSource::Picked,
    ] {
        let error = core
            .restore_backup(source, secret(PASSPHRASE), false, noon())
            .unwrap_err();
        assert_eq!(error.code, "restore");
    }
    // A wrong passphrase fails before a safety backup could prune an older backup.
    let error = core
        .restore_backup(
            RestoreSource::Registered {
                name: backup.name.clone(),
            },
            secret("not the synthetic passphrase"),
            false,
            noon(),
        )
        .unwrap_err();
    assert_eq!(error, CommandError::from(Error::Restore));
    assert_eq!(core.list_backups().unwrap().len(), 1);
    assert_eq!(core.list_entries().unwrap().len(), 2);

    let restored_at = noon() + Duration::minutes(5);
    let outcome = core
        .restore_backup(
            RestoreSource::Registered {
                name: backup.name.clone(),
            },
            secret(PASSPHRASE),
            false,
            restored_at,
        )
        .unwrap();
    assert_eq!(
        outcome,
        RestoreOutcome {
            entries: 1,
            safety_backup: true,
            set_aside: None,
        }
    );
    assert_eq!(core.list_entries().unwrap(), vec![kept]);
    assert_eq!(
        core.get_entry(&later.id).unwrap_err(),
        CommandError::from(Error::NotFound)
    );
    // No private copy of the backup is left in the data folder.
    assert!(
        names_in(&fixture.paths().data_dir)
            .iter()
            .all(|name| !name.starts_with(".ttd-incomplete-"))
    );

    // The safety backup, listed first, holds the journal as it was before the restore.
    let safety = core.list_backups().unwrap().remove(0);
    assert_eq!(safety.created_at, restored_at.timestamp());
    let check = TempDir::new().unwrap();
    let mut replaced = Journal::open(&check.path().join("check.sqlite")).unwrap();
    replaced
        .restore_from(&fixture.folder().join(&safety.name), PASSPHRASE)
        .unwrap();
    let mut texts: Vec<_> = replaced.list().unwrap().iter().map(text_of).collect();
    texts.sort();
    assert_eq!(
        texts,
        [
            "Synthetic edit made after the backup.",
            "Synthetic entry after the backup."
        ]
    );
}

#[test]
fn restoring_the_oldest_of_thirty_backups_survives_its_pruning_by_the_safety_backup() {
    let fixture = Fixture::new();
    let mut core = ready_with_backups(&fixture);
    let kept = core
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic entry in the oldest backup.",
        ))
        .unwrap();
    core.backup_now(noon()).unwrap();
    let oldest = core.list_backups().unwrap().remove(0);
    register_stand_ins(&fixture.folder(), noon().timestamp(), 29);
    assert_eq!(core.list_backups().unwrap().len(), 30);
    core.save_entry(draft("2026-11-22", Slot::Evening, "Synthetic later entry."))
        .unwrap();

    let outcome = core
        .restore_backup(
            RestoreSource::Registered {
                name: oldest.name.clone(),
            },
            secret(PASSPHRASE),
            false,
            noon() + Duration::hours(1),
        )
        .unwrap();
    assert!(outcome.safety_backup);
    assert_eq!(core.list_entries().unwrap(), vec![kept]);
    // Retention removed the restored file only after the restore had copied it.
    assert!(!fixture.folder().join(&oldest.name).exists());
    assert_eq!(core.list_backups().unwrap().len(), 30);
}

#[test]
fn a_new_mac_restores_with_only_the_backup_file_and_its_passphrase() {
    let original = Fixture::new();
    let mut core = ready_with_backups(&original);
    let morning = core
        .save_entry(draft(
            "2026-11-21",
            Slot::Morning,
            "Synthetic morning to recover.",
        ))
        .unwrap();
    let evening = core
        .save_entry(draft(
            "2026-11-21",
            Slot::Evening,
            "Synthetic evening to recover.",
        ))
        .unwrap();
    core.backup_now(noon()).unwrap();
    let backup = original
        .folder()
        .join(core.list_backups().unwrap().remove(0).name);

    // A clean Mac: no folder, no Keychain item, an empty journal.
    let clean = Fixture::new();
    let mut core = clean.launch();
    let picked = core.pick_restore_file(Some(backup.clone())).unwrap();
    assert_eq!(
        Some(picked.name.as_str()),
        backup.file_name().and_then(|name| name.to_str())
    );
    let outcome = core
        .restore_backup(RestoreSource::Picked, secret(PASSPHRASE), false, noon())
        .unwrap();
    assert_eq!(
        outcome,
        RestoreOutcome {
            entries: 2,
            safety_backup: false,
            set_aside: None,
        }
    );
    assert_eq!(
        core.entries_on("2026-11-21").unwrap(),
        vec![morning, evening]
    );
    // The picked file is used once; the backup folder of the clean Mac was never involved.
    let error = core
        .restore_backup(RestoreSource::Picked, secret(PASSPHRASE), false, noon())
        .unwrap_err();
    assert_eq!(error.code, "restore");
    assert!(names_in(&clean.folder()).is_empty());
    assert_eq!(core.pick_restore_file(None), None);
}

#[test]
fn erasing_removes_app_data_and_secrets_but_never_the_backup_folder() {
    let fixture = Fixture::new();
    let mut core = fixture.launch();
    core.set_backup_folder(fixture.folder(), noon()).unwrap();
    core.set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    core.save_entry(draft(
        "2026-11-22",
        Slot::Morning,
        "Synthetic entry to erase.",
    ))
    .unwrap();
    // Synthetic files stand in for earlier backups and other files in the chosen folder.
    fs::write(
        fixture.folder().join("ttd-1-synthetic.ttd.age"),
        b"synthetic",
    )
    .unwrap();
    fs::write(fixture.folder().join("synthetic notes.txt"), b"synthetic").unwrap();
    let folder_before = names_in(&fixture.folder());
    let leftover = fixture.paths().data_dir.join(".ttd-incomplete-synthetic");
    fs::write(&leftover, b"synthetic").unwrap();

    let error = core.erase_app_data("erase", noon()).unwrap_err();
    assert_eq!(error, CommandError::confirmation());
    assert_eq!(core.list_entries().unwrap().len(), 1);

    let startup = core.erase_app_data(ERASE_CONFIRMATION, noon()).unwrap();
    assert_eq!(startup.state, StartupState::Ready);
    assert!(core.list_entries().unwrap().is_empty());
    assert!(!fixture.paths().plan.exists());
    assert!(!leftover.exists());
    assert_eq!(fixture.keychain.contents().item, None);
    let status = core.backup_status(noon());
    assert_eq!(status.state, BackupState::NeedsFolder);
    assert!(!status.passphrase_available && !status.remembered);
    assert_eq!(names_in(&fixture.folder()), folder_before);
    drop(core);
    // The next launch finds the fresh journal and no remembered settings.
    let core = fixture.launch();
    assert!(core.list_entries().unwrap().is_empty());
    assert_eq!(core.backup_status(noon()).state, BackupState::NeedsFolder);
}

#[test]
fn an_incomplete_erasure_is_reported_after_the_journal_is_reopened() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    let mut core = fixture.launch();
    core.save_entry(draft(
        "2026-11-22",
        Slot::Morning,
        "Synthetic entry to erase.",
    ))
    .unwrap();
    fixture.keychain.contents().failing = true;
    let error = core.erase_app_data(ERASE_CONFIRMATION, noon()).unwrap_err();
    assert_eq!(error, CommandError::keychain());
    assert_eq!(core.startup_status().state, StartupState::Ready);
    assert!(core.list_entries().unwrap().is_empty());
}

#[test]
fn the_journal_closes_at_exit_only_when_no_operation_holds_it() {
    let fixture = Fixture::new();
    let state = AppState::new(fixture.paths(), Box::new(fixture.keychain.clone()));
    state.lock().launch(noon());
    {
        let core = state.lock();
        state.close_if_idle();
        assert!(core.list_entries().is_ok());
    }
    state.close_if_idle();
    assert_eq!(
        state.lock().list_entries().unwrap_err(),
        CommandError::not_ready()
    );
}

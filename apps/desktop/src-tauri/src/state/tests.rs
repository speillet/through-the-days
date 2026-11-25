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
    AppState, ERASE_CONFIRMATION, OPEN_FAILED, RestoreOutcome, RestoreSource, StartupState,
    backup::BackupState,
};
use crate::{
    error::CommandError,
    keychain::fake::FakeKeychain,
    paths::{self, DataPaths},
};
use chrono::{DateTime, Duration, TimeZone, Utc};
use journal_core::{BackupPlan, Entry, Error, Journal, Slot, document_text, list_backups};
use serde_json::{Value, json};
use std::{
    cell::RefCell,
    fs,
    os::unix::fs::{FileExt, PermissionsExt},
    path::{Path, PathBuf},
    rc::Rc,
    sync::{Arc, mpsc},
    thread,
    time::Duration as Wait,
};
use tempfile::TempDir;
use zeroize::Zeroizing;

/// Frozen synthetic content of earlier schema versions, shared with journal-core's tests.
#[allow(dead_code, reason = "the shared fixtures serve several test crates")]
mod fixtures {
    include!("../../../../../crates/journal-core/tests/common/fixtures.rs");
}

const PASSPHRASE: &str = "synthetic portable backup passphrase";
const WRONG_PASSPHRASE: &str = "not the synthetic passphrase";

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

    /// The managed state before launch, as `setup` creates it.
    fn state(&self) -> AppState {
        AppState::new(self.paths(), Box::new(self.keychain.clone()))
    }

    fn launch(&self) -> AppState {
        self.launch_at(noon())
    }

    fn launch_at(&self, now: DateTime<Utc>) -> AppState {
        let state = self.state();
        state.launch(now);
        state
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

    /// A new fixture whose data folder holds a copy of the files in `data_dir`.
    fn with_files_of(data_dir: &Path) -> Self {
        let fixture = Self::new();
        let copy = fixture.paths().data_dir;
        fs::create_dir_all(&copy).unwrap();
        for entry in fs::read_dir(data_dir).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_file() {
                fs::copy(entry.path(), copy.join(entry.file_name())).unwrap();
            }
        }
        fixture
    }
}

/// Runs `operation`, copying the data folder of `fixture` at each interruption point it reaches.
/// Each copy holds the files that a quit, a crash or a power cut at that point would leave.
fn copies_at_interruptions<T>(
    fixture: &Fixture,
    operation: impl FnOnce() -> T,
) -> (T, Vec<Fixture>) {
    let data_dir = fixture.paths().data_dir;
    let copies = Rc::new(RefCell::new(Vec::new()));
    let observed = Rc::clone(&copies);
    let result = paths::interruption::observe(
        move || {
            observed
                .borrow_mut()
                .push(Fixture::with_files_of(&data_dir))
        },
        operation,
    );
    (result, copies.take())
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

/// Writes the frozen fictional schema-version-1 journal, with one Morning entry on 22 November
/// 2026, and returns that entry's id. Version 1 had no trash column and no perceived progress.
fn previous_journal(path: &Path) -> String {
    let connection = rusqlite::Connection::open(path).unwrap();
    connection.execute_batch(fixtures::V1_SCHEMA).unwrap();
    connection
        .execute(
            fixtures::V1_INSERT_ENTRY,
            [fixtures::V1_ENTRY_ID, fixtures::V1_ENTRY_PAYLOAD],
        )
        .unwrap();
    fixtures::V1_ENTRY_ID.to_owned()
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

/// Overwrites `length` bytes at `offset` with a synthetic damage pattern, as a failing disk can.
fn damage(path: &Path, offset: u64, length: usize) {
    let file = fs::OpenOptions::new().write(true).open(path).unwrap();
    file.write_all_at(&vec![0xA5; length], offset).unwrap();
    file.sync_all().unwrap();
}

/// Writes a closed journal with one synthetic entry, then damages its file header.
fn damaged_header(path: &Path) {
    let journal = Journal::open(path).unwrap();
    let mut entry = Entry::draft("2026-11-20", Slot::Morning);
    entry.document = document("Synthetic entry on a damaged disk.");
    journal.save(entry).unwrap();
    drop(journal);
    damage(path, 0, 16);
}

/// Writes plain text where the journal database belongs.
fn not_a_database(path: &Path) {
    fs::write(path, "Synthetic plain text where the journal should be.").unwrap();
}

/// Byte offset and size of the root page of `table` in the closed database at `path`.
fn root_page(path: &Path, table: &str) -> (u64, usize) {
    let connection = rusqlite::Connection::open(path).unwrap();
    let page_size: i64 = connection
        .pragma_query_value(None, "page_size", |row| row.get(0))
        .unwrap();
    let root: i64 = connection
        .query_row(
            "SELECT rootpage FROM sqlite_master WHERE name=?1",
            [table],
            |row| row.get(0),
        )
        .unwrap();
    (
        u64::try_from((root - 1) * page_size).unwrap(),
        usize::try_from(page_size).unwrap(),
    )
}

/// Saves 40 synthetic entries on 20 dates, enough to fill several database pages.
fn fill(app: &AppState) {
    for index in 0..40 {
        let slot = if index % 2 == 0 {
            Slot::Morning
        } else {
            Slot::Evening
        };
        let date = format!("2026-10-{:02}", 1 + index / 2);
        let text = format!("Synthetic entry {index}: a fictional paragraph for several pages.");
        app.lock().save_entry(draft(&date, slot, &text)).unwrap();
    }
}

fn names_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<_> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

fn ready_with_backups(fixture: &Fixture) -> AppState {
    let app = fixture.launch();
    app.choose_backup_folder(fixture.folder(), noon()).unwrap();
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    app
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
    let app = fixture.launch();
    let location = fixture.paths().data_dir.display().to_string();
    assert_eq!(
        serde_json::to_value(app.startup_status()).unwrap(),
        json!({"state": "ready", "fromVersion": null, "message": null, "dataLocation": location})
    );
    assert!(fixture.paths().journal.is_file());
    let core = app.lock();
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
    let app = fixture.launch();
    // Multilingual fixture: user-authored text is stored exactly as typed.
    let text = "Synthetic morning note. Multilingual fixture: café, ελληνικά, 日本語.";
    let saved = app
        .lock()
        .save_entry(draft("2026-11-22", Slot::Morning, text))
        .unwrap();
    assert_eq!(saved.revision, 1);
    let mut preferences = serde_json::to_value(app.lock().preferences().unwrap()).unwrap();
    preferences["timeZone"] = json!("America/New_York");
    preferences["theme"] = json!("dark");
    preferences["textScale"] = json!(130);
    let stored = app.lock().set_preferences(preferences).unwrap();
    assert_eq!((stored.theme.as_str(), stored.text_scale), ("dark", 130));
    drop(app);

    let app = fixture.launch();
    let core = app.lock();
    let reopened = core.get_entry(&saved.id).unwrap();
    assert_eq!(text_of(&reopened), text);
    assert_eq!(core.entries_on("2026-11-22").unwrap(), vec![saved]);
    let preferences = core.preferences().unwrap();
    assert_eq!(
        (preferences.theme.as_str(), preferences.text_scale),
        ("dark", 130)
    );
    // 03:00 UTC on 23 November is still 22 November in the journal's time zone.
    let late = Utc.with_ymd_and_hms(2026, 11, 23, 3, 0, 0).unwrap();
    assert_eq!(core.today(late).unwrap(), "2026-11-22");
}

#[test]
fn malformed_input_is_refused_with_english_errors_and_changes_nothing() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let core = app.lock();
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
    for (field, value, code) in [
        ("timeZone", json!("Synthetic/Nowhere"), "date"),
        ("theme", json!("synthetic"), "document"),
        ("textScale", json!(120), "document"),
    ] {
        let mut preferences = serde_json::to_value(core.preferences().unwrap()).unwrap();
        preferences[field] = value;
        assert_eq!(
            core.set_preferences(preferences).unwrap_err().code,
            code,
            "{field}"
        );
    }
    assert_eq!(core.entries_on("2026-02-30").unwrap_err().code, "date");

    let mut valid = entry;
    valid["mood"] = json!(0);
    valid["energy"] = json!(10);
    assert_eq!(core.save_entry(valid).unwrap().revision, 2);
}

#[test]
fn trash_restores_free_slots_and_reports_occupied_ones() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let core = app.lock();
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

/// local-data-protection — Retention expires: ordinary restoration is unavailable as soon as
/// the 30 days have passed, even while the app is open and before the next purge.
#[test]
fn trash_past_its_thirty_days_cannot_be_restored_even_before_the_purge() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let core = app.lock();
    let morning = core
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic morning."))
        .unwrap();
    let evening = core
        .save_entry(draft("2026-11-22", Slot::Evening, "Synthetic evening."))
        .unwrap();
    core.trash_entry(&morning.id, morning.revision, noon())
        .unwrap();
    core.trash_entry(&evening.id, evening.revision, noon())
        .unwrap();
    let expiry = noon() + Duration::days(30);
    assert_eq!(
        core.restore_entry(&morning.id, expiry).unwrap_err(),
        CommandError::from(Error::NotFound)
    );
    let restored = core
        .restore_entry(&evening.id, expiry - Duration::seconds(1))
        .unwrap();
    assert_eq!(text_of(&restored), "Synthetic evening.");
}

#[test]
fn expired_trash_is_purged_when_the_journal_opens() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let entry = app
        .lock()
        .save_entry(draft(
            "2026-11-22",
            Slot::Evening,
            "Synthetic entry to delete.",
        ))
        .unwrap();
    app.lock()
        .trash_entry(&entry.id, entry.revision, noon())
        .unwrap();
    drop(app);
    let app = fixture.launch_at(noon() + Duration::days(30) - Duration::seconds(1));
    assert_eq!(app.lock().list_trash().unwrap().len(), 1);
    drop(app);
    let app = fixture.launch_at(noon() + Duration::days(30));
    assert!(app.lock().list_trash().unwrap().is_empty());
}

#[test]
fn an_older_journal_waits_for_its_protected_upgrade_without_being_changed() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.paths().data_dir).unwrap();
    let id = previous_journal(&fixture.paths().journal);
    let original = fixture.journal_bytes();
    let app = fixture.launch();
    let startup = app.startup_status();
    assert_eq!(startup.state, StartupState::NeedsMigration);
    assert_eq!(startup.from_version, Some(1));
    assert_eq!(startup.message, None);

    // The journal waits for the upgrade; backup settings stay available.
    let waiting = {
        let mut core = app.lock();
        [
            core.list_entries().unwrap_err(),
            core.save_entry(draft("2026-11-22", Slot::Evening, "Synthetic."))
                .unwrap_err(),
            core.run_daily_backup(noon()).unwrap_err(),
            core.backup_now(noon()).unwrap_err(),
            core.restore_backup(RestoreSource::Picked, PASSPHRASE, false, noon())
                .unwrap_err(),
        ]
    };
    assert!(
        waiting
            .iter()
            .all(|error| *error == CommandError::not_ready())
    );
    assert_eq!(
        app.lock().backup_status(noon()).state,
        BackupState::NeedsFolder
    );
    let error = app
        .migrate_journal(Some(secret(PASSPHRASE)), false, noon())
        .unwrap_err();
    assert_eq!(error.code, "needsFolder");
    app.choose_backup_folder(fixture.folder(), noon()).unwrap();
    let error = app
        .migrate_journal(Some(secret("too short")), false, noon())
        .unwrap_err();
    assert_eq!(error.code, "passphrase");
    assert_eq!(fixture.journal_bytes(), original);

    let startup = app
        .migrate_journal(Some(secret(PASSPHRASE)), false, noon())
        .unwrap();
    assert_eq!(startup.state, StartupState::Ready);
    assert_eq!(startup.from_version, None);
    let entry = app.lock().get_entry(&id).unwrap();
    // The frozen version-1 payload, with perceived progress recorded as missing.
    assert_eq!(entry.progress, None);
    assert_eq!(entry.mood, Some(3));
    assert_eq!(
        (entry.date.as_str(), entry.slot),
        ("2026-11-22", Slot::Morning)
    );
    assert_eq!(text_of(&entry), "Synthetic previous journal.");
    assert_eq!(
        entry.reflection.difficulty,
        "Synthetic difficulty from the previous version."
    );
    assert_eq!(list_backups(&fixture.folder()).unwrap().len(), 1);
    let status = app.lock().backup_status(noon());
    assert!(status.passphrase_available);
    assert!(!status.remembered);
    assert_eq!(fixture.keychain.contents().item, None);
    // Asking again after the upgrade changes nothing.
    let again = app
        .migrate_journal(Some(secret(PASSPHRASE)), false, noon())
        .unwrap();
    assert_eq!(again, startup);
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
    let app = fixture.launch();
    assert_eq!(app.startup_status().state, StartupState::Ready);
    assert_eq!(
        text_of(&app.lock().get_entry(&id).unwrap()),
        "Synthetic previous journal."
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
    let app = fixture.launch();
    let startup = app.startup_status();
    assert_eq!(startup.state, StartupState::NeedsMigration);
    assert_eq!(startup.from_version, Some(1));
    assert_eq!(startup.message, Some(Error::BackupFolder.to_string()));
    assert_eq!(fixture.journal_bytes(), original);
}

/// local-data-protection — Recoverable pre-migration backup: once the folder is back, the
/// upgrade runs again with the passphrase already in the session, which stays remembered.
#[test]
fn retrying_an_upgrade_with_the_session_passphrase_keeps_it_remembered() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    let drive = fixture.backups.path().join("unplugged synthetic drive");
    fixture.store_plan(&BackupPlan {
        folder: Some(drive.clone()),
        remember: true,
        ..BackupPlan::default()
    });
    previous_journal(&fixture.paths().journal);
    let app = fixture.launch();
    assert_eq!(app.startup_status().state, StartupState::NeedsMigration);
    let status = app.lock().backup_status(noon());
    assert!(status.passphrase_available && status.remembered);

    fs::create_dir(&drive).unwrap();
    // `remember` false is not a request to forget: a retry never removes the Keychain item.
    let startup = app.migrate_journal(None, false, noon()).unwrap();
    assert_eq!(startup.state, StartupState::Ready);
    assert_eq!(list_backups(&drive).unwrap().len(), 1);
    assert_eq!(
        fixture.keychain.contents().item.as_deref(),
        Some(PASSPHRASE)
    );
    assert!(fixture.stored_plan().remember);
    assert!(app.lock().backup_status(noon()).remembered);
}

#[test]
fn an_upgrade_without_a_new_passphrase_needs_the_one_in_the_session() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.paths().data_dir).unwrap();
    previous_journal(&fixture.paths().journal);
    let app = fixture.launch();
    app.choose_backup_folder(fixture.folder(), noon()).unwrap();
    assert_eq!(
        app.migrate_journal(None, true, noon()).unwrap_err(),
        CommandError::needs_passphrase()
    );
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    // Asked to remember it, the retry stores the session passphrase in Keychain.
    let startup = app.migrate_journal(None, true, noon()).unwrap();
    assert_eq!(startup.state, StartupState::Ready);
    assert_eq!(
        fixture.keychain.contents().item.as_deref(),
        Some(PASSPHRASE)
    );
    assert!(fixture.stored_plan().remember);
}

#[test]
fn newer_or_foreign_databases_are_unsupported_and_left_unchanged_until_erased() {
    for create in [newer_journal as fn(&Path), foreign_database] {
        let fixture = Fixture::new();
        fs::create_dir_all(&fixture.paths().data_dir).unwrap();
        create(&fixture.paths().journal);
        let original = fixture.journal_bytes();
        let app = fixture.launch();
        let startup = app.startup_status();
        assert_eq!(startup.state, StartupState::Unsupported);
        assert_eq!(startup.message, Some(Error::Unsupported.to_string()));
        assert_eq!(
            app.lock().today(noon()).unwrap_err(),
            CommandError::not_ready()
        );
        // Trying again leaves it unsupported and unchanged.
        assert_eq!(app.retry_startup(noon()), startup);
        assert_eq!(fixture.journal_bytes(), original);
        // Erasing application data is one way back to a usable, empty journal.
        let startup = app.erase_app_data(ERASE_CONFIRMATION, noon()).unwrap();
        assert_eq!(startup.state, StartupState::Ready);
        assert!(app.lock().list_entries().unwrap().is_empty());
    }
}

/// local-data-protection — Safe restore: a damaged journal file is reported as damage, which a
/// backup can repair, and is never changed by opening it again.
#[test]
fn a_damaged_journal_file_reports_a_failed_start_that_explains_the_damage() {
    for create in [damaged_header as fn(&Path), not_a_database] {
        let fixture = Fixture::new();
        fs::create_dir_all(&fixture.paths().data_dir).unwrap();
        create(&fixture.paths().journal);
        let original = fixture.journal_bytes();
        let app = fixture.launch();
        let startup = app.startup_status();
        assert_eq!(startup.state, StartupState::Failed);
        assert_eq!(startup.message, Some(Error::Damaged.to_string()));
        assert_eq!(app.retry_startup(noon()), startup);
        assert_eq!(fixture.journal_bytes(), original);
    }
}

#[test]
fn an_unusable_data_folder_reports_a_failed_start() {
    let fixture = Fixture::new();
    let data_dir = fixture.paths().data_dir;
    fs::create_dir_all(data_dir.parent().unwrap()).unwrap();
    fs::write(&data_dir, b"synthetic file where the data folder belongs").unwrap();
    let app = fixture.launch();
    let startup = app.startup_status();
    assert_eq!(startup.state, StartupState::Failed);
    assert_eq!(startup.message.as_deref(), Some(OPEN_FAILED));
    assert_eq!(
        app.lock().list_entries().unwrap_err(),
        CommandError::not_ready()
    );
}

/// The cause of a failed start, such as another process holding the file, can go away while the
/// app stays open: trying again opens the journal then.
#[test]
fn trying_again_opens_the_journal_once_the_cause_of_a_failed_start_is_gone() {
    let fixture = Fixture::new();
    let data_dir = fixture.paths().data_dir;
    fs::create_dir_all(data_dir.parent().unwrap()).unwrap();
    fs::write(&data_dir, b"synthetic file where the data folder belongs").unwrap();
    let app = fixture.launch();
    assert_eq!(app.startup_status().state, StartupState::Failed);
    assert_eq!(app.retry_startup(noon()).state, StartupState::Failed);

    fs::remove_file(&data_dir).unwrap();
    let startup = app.retry_startup(noon());
    assert_eq!(startup.state, StartupState::Ready);
    assert_eq!(startup.message, None);
    assert_eq!(app.startup_status(), startup);
    app.lock()
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic note."))
        .unwrap();
    // Once the journal is open, trying again changes nothing.
    assert_eq!(app.retry_startup(noon()), startup);
    assert_eq!(app.lock().list_entries().unwrap().len(), 1);
}

#[test]
fn backup_status_follows_the_folder_passphrase_and_todays_result() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    assert_eq!(
        app.lock().backup_now(noon()).unwrap_err().code,
        "needsFolder"
    );
    assert_eq!(
        app.lock().run_daily_backup(noon()).unwrap().state,
        BackupState::NeedsFolder
    );

    let status = app.choose_backup_folder(fixture.folder(), noon()).unwrap();
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
    assert_eq!(
        app.lock().backup_now(noon()).unwrap_err().code,
        "needsPassphrase"
    );
    // A due backup without its passphrase is pending, not an error, and writing continues.
    assert_eq!(
        app.lock().run_daily_backup(noon()).unwrap().state,
        BackupState::NeedsPassphrase
    );
    let entry = app
        .lock()
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic entry worth keeping.",
        ))
        .unwrap();
    let error = app
        .set_backup_passphrase(secret("eleven char"), false, noon())
        .unwrap_err();
    assert_eq!(error.code, "passphrase");

    let status = app
        .set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    assert_eq!(status.state, BackupState::Due);
    assert!(status.passphrase_available && !status.remembered);

    let status = app.lock().run_daily_backup(noon()).unwrap();
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
    let later = app
        .lock()
        .run_daily_backup(noon() + Duration::hours(3))
        .unwrap();
    assert_eq!(later, status);
    assert_eq!(app.lock().list_backups().unwrap().len(), 1);
    assert_eq!(app.lock().get_entry(&entry.id).unwrap(), entry);
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
    let app = fixture.launch();
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    let status = app.lock().run_daily_backup(noon()).unwrap();
    assert_eq!(status.state, BackupState::Failed);
    assert_eq!(
        status.last_error,
        Some(CommandError::from(Error::BackupFolder))
    );
    assert_eq!(status.last_success_date.as_deref(), Some("2026-11-21"));
    assert_eq!(
        app.lock().backup_now(noon()).unwrap_err().code,
        "backupFolder"
    );
    // No success is recorded for a failed attempt.
    assert_eq!(
        fixture.stored_plan().last_success_date.as_deref(),
        Some("2026-11-21")
    );

    // Results that described the previous folder are forgotten with it.
    let status = app.choose_backup_folder(fixture.folder(), noon()).unwrap();
    assert_eq!(status.state, BackupState::Due);
    assert_eq!(status.last_error, None);
    assert_eq!(status.last_success_date, None);
    assert_eq!(status.last_success_at, None);
    assert!(!status.retention_warning);
    // Choosing the same folder again changes nothing.
    assert_eq!(
        app.choose_backup_folder(fixture.folder(), noon()).unwrap(),
        status
    );
}

/// A folder that keeps failing does not cost a snapshot, two key derivations and a written file
/// each time the app is focused: automatic attempts pause for an hour after a failure.
#[test]
fn a_failed_daily_backup_pauses_automatic_attempts_for_an_hour() {
    let fixture = Fixture::new();
    let drive = fixture.backups.path().join("unplugged synthetic drive");
    fixture.store_plan(&BackupPlan {
        folder: Some(drive.clone()),
        ..BackupPlan::default()
    });
    let app = fixture.launch();
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    let failed = app.lock().run_daily_backup(noon()).unwrap();
    assert_eq!(failed.state, BackupState::Failed);
    assert_eq!(
        failed.last_error,
        Some(CommandError::from(Error::BackupFolder))
    );

    // The drive is back, but the next automatic attempt waits for the hour to pass.
    fs::create_dir(&drive).unwrap();
    let paused = app
        .lock()
        .run_daily_backup(noon() + Duration::minutes(59))
        .unwrap();
    assert_eq!(paused, failed);
    assert!(list_backups(&drive).unwrap().is_empty());
    let retried = app
        .lock()
        .run_daily_backup(noon() + Duration::minutes(60))
        .unwrap();
    assert_eq!(retried.state, BackupState::UpToDate);
    assert_eq!(list_backups(&drive).unwrap().len(), 1);
}

#[test]
fn back_up_now_and_a_new_passphrase_try_again_during_the_pause() {
    let fixture = Fixture::new();
    let drive = fixture.backups.path().join("synthetic drive");
    let unplugged = fixture.backups.path().join("synthetic drive, unplugged");
    fixture.store_plan(&BackupPlan {
        folder: Some(drive.clone()),
        ..BackupPlan::default()
    });
    let app = fixture.launch();
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    assert_eq!(
        app.lock().run_daily_backup(noon()).unwrap().state,
        BackupState::Failed
    );
    fs::create_dir(&drive).unwrap();
    // "Back up now" always tries.
    let status = app
        .lock()
        .backup_now(noon() + Duration::minutes(1))
        .unwrap();
    assert_eq!(status.state, BackupState::UpToDate);
    assert_eq!(list_backups(&drive).unwrap().len(), 1);

    // The next day the drive is unplugged again, then reconnected within the hour.
    let next_day = noon() + Duration::days(1);
    fs::rename(&drive, &unplugged).unwrap();
    assert_eq!(
        app.lock().run_daily_backup(next_day).unwrap().state,
        BackupState::Failed
    );
    fs::rename(&unplugged, &drive).unwrap();
    let paused = app
        .lock()
        .run_daily_backup(next_day + Duration::minutes(1))
        .unwrap();
    assert_eq!(paused.state, BackupState::Failed);
    assert_eq!(list_backups(&drive).unwrap().len(), 1);
    // Entering the passphrase again ends the pause.
    app.set_backup_passphrase(secret(PASSPHRASE), false, next_day)
        .unwrap();
    let status = app
        .lock()
        .run_daily_backup(next_day + Duration::minutes(2))
        .unwrap();
    assert_eq!(status.state, BackupState::UpToDate);
    assert_eq!(list_backups(&drive).unwrap().len(), 2);
}

/// local-data-protection — Interrupted backup write: a folder that cannot receive backups is
/// refused when it is chosen, and the check leaves nothing in a folder that can.
#[test]
fn a_backup_folder_is_checked_before_it_is_chosen() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let missing = fixture.backups.path().join("unplugged synthetic drive");
    let read_only = fixture.backups.path().join("read-only synthetic folder");
    fs::create_dir(&read_only).unwrap();
    fs::set_permissions(&read_only, fs::Permissions::from_mode(0o500)).unwrap();
    for folder in [missing, read_only.clone()] {
        let error = app.choose_backup_folder(folder, noon()).unwrap_err();
        assert_eq!(error, CommandError::from(Error::BackupFolder));
    }
    fs::set_permissions(&read_only, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(
        app.lock().backup_status(noon()).state,
        BackupState::NeedsFolder
    );
    assert!(!fixture.paths().plan.exists());

    let writable = fixture.backups.path().join("synthetic backups");
    fs::create_dir(&writable).unwrap();
    let status = app.choose_backup_folder(writable.clone(), noon()).unwrap();
    assert_eq!(status.state, BackupState::NeedsPassphrase);
    assert!(names_in(&writable).is_empty());
    assert!(names_in(&read_only).is_empty());
}

/// A restore stages its copy in the data folder, and a backup published there would remove it:
/// the data folder, and any folder inside it, cannot be the backup folder.
#[test]
fn the_data_folder_cannot_be_the_backup_folder() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let data_dir = fixture.paths().data_dir;
    let inside = data_dir.join("synthetic backups");
    fs::create_dir(&inside).unwrap();
    for folder in [data_dir, inside] {
        let error = app.choose_backup_folder(folder, noon()).unwrap_err();
        assert_eq!(error.code, "backupFolder");
        assert_eq!(
            error.message,
            "Choose a folder outside the app's own data folder."
        );
    }
    assert_eq!(
        app.lock().backup_status(noon()).state,
        BackupState::NeedsFolder
    );
    assert!(!fixture.paths().plan.exists());
}

#[test]
fn a_restore_still_works_when_earlier_settings_put_backups_in_the_data_folder() {
    let fixture = Fixture::new();
    // Backup settings written before the data folder was refused.
    fixture.store_plan(&BackupPlan {
        folder: Some(fixture.paths().data_dir),
        ..BackupPlan::default()
    });
    let app = fixture.launch();
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    let kept = app
        .lock()
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic kept entry."))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let backup = app.lock().list_backups().unwrap().remove(0);
    app.lock()
        .save_entry(draft("2026-11-22", Slot::Evening, "Synthetic later entry."))
        .unwrap();
    let outcome = app
        .lock()
        .restore_backup(
            RestoreSource::Registered { name: backup.name },
            PASSPHRASE,
            false,
            noon() + Duration::minutes(5),
        )
        .unwrap();
    assert!(outcome.safety_backup);
    assert_eq!(app.lock().list_entries().unwrap(), vec![kept]);
}

#[test]
fn the_passphrase_is_remembered_only_when_asked() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let status = app
        .set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    assert!(status.remembered && status.passphrase_available);
    assert_eq!(
        fixture.keychain.contents().item.as_deref(),
        Some(PASSPHRASE)
    );
    assert!(fixture.stored_plan().remember);
    drop(app);
    let app = fixture.launch();
    assert!(app.lock().backup_status(noon()).passphrase_available);

    // Declining Keychain storage keeps a new passphrase for this session only.
    let status = app
        .set_backup_passphrase(secret("another synthetic passphrase"), false, noon())
        .unwrap();
    assert!(status.passphrase_available && !status.remembered);
    assert_eq!(fixture.keychain.contents().item, None);
    drop(app);
    let app = fixture.launch();
    let status = app.lock().backup_status(noon());
    assert!(!status.passphrase_available && !status.remembered);
    assert_eq!(app.startup_status().state, StartupState::Ready);

    app.set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    let status = app.forget_backup_passphrase(noon()).unwrap();
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
    let app = fixture.launch();
    assert_eq!(app.startup_status().state, StartupState::Ready);
    assert!(!app.lock().backup_status(noon()).passphrase_available);

    let error = app
        .set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap_err();
    assert_eq!(error, CommandError::keychain());
    let status = app.lock().backup_status(noon());
    assert!(status.passphrase_available);
    assert!(!status.remembered);
    assert!(!fixture.stored_plan().remember);

    let error = app.forget_backup_passphrase(noon()).unwrap_err();
    assert_eq!(error, CommandError::keychain());
    assert!(!app.lock().backup_status(noon()).passphrase_available);
    app.lock()
        .save_entry(draft("2026-11-22", Slot::Evening, "Synthetic note."))
        .unwrap();
}

#[test]
fn a_remembered_passphrase_that_is_gone_is_no_longer_reported_as_remembered() {
    let fixture = Fixture::new();
    fixture.store_plan(&BackupPlan {
        remember: true,
        ..BackupPlan::default()
    });
    let app = fixture.launch();
    let status = app.lock().backup_status(noon());
    assert!(!status.passphrase_available && !status.remembered);
}

/// A Keychain prompt can sit unanswered behind other windows, for example after a rebuild of
/// the app: the journal opens and saves without waiting for it.
#[test]
fn a_keychain_prompt_at_launch_never_keeps_the_journal_from_opening_or_saving() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    fixture.store_plan(&BackupPlan {
        folder: Some(fixture.folder()),
        remember: true,
        ..BackupPlan::default()
    });
    fixture.keychain.show_prompt();
    let app = Arc::new(fixture.state());
    let launching = {
        let app = Arc::clone(&app);
        thread::spawn(move || app.launch(noon()))
    };
    fixture.keychain.wait_for_prompt();

    assert_eq!(app.startup_status().state, StartupState::Ready);
    app.lock()
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic note."))
        .unwrap();
    let status = app.lock().backup_status(noon());
    assert!(status.remembered && !status.passphrase_available);

    fixture.keychain.answer();
    launching.join().unwrap();
    assert!(app.lock().backup_status(noon()).passphrase_available);
}

#[test]
fn a_keychain_prompt_while_remembering_the_passphrase_never_blocks_saving() {
    let fixture = Fixture::new();
    let app = Arc::new(fixture.launch());
    fixture.keychain.show_prompt();
    let remembering = {
        let app = Arc::clone(&app);
        thread::spawn(move || app.set_backup_passphrase(secret(PASSPHRASE), true, noon()))
    };
    fixture.keychain.wait_for_prompt();

    app.lock()
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic note."))
        .unwrap();
    assert!(!app.lock().backup_status(noon()).passphrase_available);

    fixture.keychain.answer();
    let status = remembering.join().unwrap().unwrap();
    assert!(status.passphrase_available && status.remembered);
}

/// An older journal that the remembered passphrase can upgrade at launch is not reported as
/// waiting for its upgrade while Keychain is still being read.
#[test]
fn an_older_journal_waits_for_the_remembered_passphrase_before_its_status_is_reported() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    fixture.store_plan(&BackupPlan {
        folder: Some(fixture.folder()),
        remember: true,
        ..BackupPlan::default()
    });
    previous_journal(&fixture.paths().journal);
    fixture.keychain.show_prompt();
    let app = Arc::new(fixture.state());
    let launching = {
        let app = Arc::clone(&app);
        thread::spawn(move || app.launch(noon()))
    };
    fixture.keychain.wait_for_prompt();
    let (reported, startup) = mpsc::channel();
    let asking = {
        let app = Arc::clone(&app);
        thread::spawn(move || reported.send(app.startup_status()).unwrap())
    };
    assert!(startup.recv_timeout(Wait::from_millis(300)).is_err());
    // Backup settings stay available meanwhile.
    assert_eq!(
        app.lock().backup_status(noon()).state,
        BackupState::NeedsPassphrase
    );

    fixture.keychain.answer();
    assert_eq!(startup.recv().unwrap().state, StartupState::Ready);
    launching.join().unwrap();
    asking.join().unwrap();
    assert_eq!(list_backups(&fixture.folder()).unwrap().len(), 1);
}

/// D-10: backup settings that cannot be read are reported, and kept as they are until the person
/// chooses a backup folder again, instead of turning silently into "not set up".
#[test]
fn unreadable_backup_settings_are_reported_and_kept_until_a_folder_is_chosen() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    fs::create_dir_all(&fixture.paths().data_dir).unwrap();
    let unreadable = br#"{"unknownField":true}"#;
    fs::write(&fixture.paths().plan, unreadable).unwrap();
    let app = fixture.launch();
    assert_eq!(app.startup_status().state, StartupState::Ready);
    let status = app.lock().backup_status(noon());
    assert_eq!(status.state, BackupState::SettingsUnreadable);
    assert!(!status.passphrase_available && !status.remembered);
    assert_eq!(status.folder_path, None);

    app.set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    assert_eq!(
        app.lock().run_daily_backup(noon()).unwrap().state,
        BackupState::SettingsUnreadable
    );
    assert_eq!(fs::read(&fixture.paths().plan).unwrap(), unreadable);

    // Choosing a backup folder writes the settings again, with the Keychain choice made since.
    let status = app.choose_backup_folder(fixture.folder(), noon()).unwrap();
    assert_eq!(status.state, BackupState::Due);
    assert!(status.remembered);
    let stored = fixture.stored_plan();
    assert_eq!(stored.folder, Some(fixture.folder()));
    assert!(stored.remember);
    drop(app);
    let app = fixture.launch();
    let status = app.lock().backup_status(noon());
    assert_eq!(status.state, BackupState::Due);
    assert!(status.passphrase_available);
}

#[test]
fn restore_publishes_a_safety_backup_first_and_brings_back_the_backed_up_journal() {
    let fixture = Fixture::new();
    let app = ready_with_backups(&fixture);
    let kept = app
        .lock()
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic entry in the backup.",
        ))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let backup = app.lock().list_backups().unwrap().remove(0);
    app.lock()
        .save_entry(edited(&kept, "Synthetic edit made after the backup."))
        .unwrap();
    let later = app
        .lock()
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
        let error = app
            .lock()
            .restore_backup(source, PASSPHRASE, false, noon())
            .unwrap_err();
        assert_eq!(error, CommandError::backup_unavailable());
    }
    // A wrong passphrase fails before a safety backup could prune an older backup.
    let error = app
        .lock()
        .restore_backup(
            RestoreSource::Registered {
                name: backup.name.clone(),
            },
            WRONG_PASSPHRASE,
            false,
            noon(),
        )
        .unwrap_err();
    assert_eq!(error, CommandError::from(Error::Restore));
    assert_eq!(app.lock().list_backups().unwrap().len(), 1);
    assert_eq!(app.lock().list_entries().unwrap().len(), 2);

    let restored_at = noon() + Duration::minutes(5);
    let outcome = app
        .lock()
        .restore_backup(
            RestoreSource::Registered {
                name: backup.name.clone(),
            },
            PASSPHRASE,
            false,
            restored_at,
        )
        .unwrap();
    assert_eq!(
        outcome,
        RestoreOutcome {
            entries: 1,
            safety_backup: true,
            set_aside: None
        }
    );
    assert_eq!(app.lock().list_entries().unwrap(), vec![kept]);
    assert_eq!(
        app.lock().get_entry(&later.id).unwrap_err(),
        CommandError::from(Error::NotFound)
    );
    // No private copy of the backup is left in the data folder.
    assert!(
        names_in(&fixture.paths().data_dir)
            .iter()
            .all(|name| !name.starts_with(".ttd-"))
    );

    // The safety backup, listed first, holds the journal as it was before the restore.
    let safety = app.lock().list_backups().unwrap().remove(0);
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
    let app = ready_with_backups(&fixture);
    let kept = app
        .lock()
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic entry in the oldest backup.",
        ))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let oldest = app.lock().list_backups().unwrap().remove(0);
    register_stand_ins(&fixture.folder(), noon().timestamp(), 29);
    assert_eq!(app.lock().list_backups().unwrap().len(), 30);
    app.lock()
        .save_entry(draft("2026-11-22", Slot::Evening, "Synthetic later entry."))
        .unwrap();

    let outcome = app
        .lock()
        .restore_backup(
            RestoreSource::Registered {
                name: oldest.name.clone(),
            },
            PASSPHRASE,
            false,
            noon() + Duration::hours(1),
        )
        .unwrap();
    assert!(outcome.safety_backup);
    assert_eq!(app.lock().list_entries().unwrap(), vec![kept]);
    // Retention removed the restored file only after the restore had copied it.
    assert!(!fixture.folder().join(&oldest.name).exists());
    assert_eq!(app.lock().list_backups().unwrap().len(), 30);
}

/// local-data-protection — Safe restore: a safety backup that fails while the current journal
/// can be read cancels the restore with its cause, even when the person would confirm going
/// ahead without one. Reconnecting the drive is enough to restore with a safety backup.
#[test]
fn a_failed_safety_backup_of_a_readable_journal_cancels_the_restore() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let drive = fixture.backups.path().join("synthetic drive");
    fs::create_dir(&drive).unwrap();
    app.choose_backup_folder(drive.clone(), noon()).unwrap();
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    let kept = app
        .lock()
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic kept entry."))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let elsewhere = TempDir::new().unwrap();
    let copy = elsewhere.path().join("synthetic copy.ttd.age");
    fs::copy(
        drive.join(app.lock().list_backups().unwrap()[0].name.clone()),
        &copy,
    )
    .unwrap();
    app.lock()
        .save_entry(draft(
            "2026-11-22",
            Slot::Evening,
            "Synthetic evening note.",
        ))
        .unwrap();
    // The backup drive is unplugged.
    let unplugged = fixture.backups.path().join("unplugged");
    fs::rename(&drive, &unplugged).unwrap();
    app.lock().pick_restore_file(Some(copy));

    // The chosen backup is checked first: a wrong passphrase is reported as such.
    let error = app
        .lock()
        .restore_backup(RestoreSource::Picked, WRONG_PASSPHRASE, false, noon())
        .unwrap_err();
    assert_eq!(error, CommandError::from(Error::Restore));
    for without_safety_backup in [false, true] {
        let error = app
            .lock()
            .restore_backup(
                RestoreSource::Picked,
                PASSPHRASE,
                without_safety_backup,
                noon(),
            )
            .unwrap_err();
        assert_eq!(
            error,
            CommandError::from(Error::BackupFolder),
            "{without_safety_backup}"
        );
        assert_eq!(app.lock().list_entries().unwrap().len(), 2);
    }
    assert_eq!(
        app.lock().backup_status(noon()).last_error,
        Some(CommandError::from(Error::BackupFolder))
    );

    fs::rename(&unplugged, &drive).unwrap();
    let restored_at = noon() + Duration::minutes(5);
    let outcome = app
        .lock()
        .restore_backup(RestoreSource::Picked, PASSPHRASE, false, restored_at)
        .unwrap();
    assert_eq!(
        outcome,
        RestoreOutcome {
            entries: 1,
            safety_backup: true,
            set_aside: None
        }
    );
    assert_eq!(app.lock().list_entries().unwrap(), vec![kept]);
    // The evening note written after the last backup is in the safety backup.
    let safety = app.lock().list_backups().unwrap().remove(0);
    assert_eq!(safety.created_at, restored_at.timestamp());
    let check = TempDir::new().unwrap();
    let mut replaced = Journal::open(&check.path().join("check.sqlite")).unwrap();
    replaced
        .restore_from(&drive.join(&safety.name), PASSPHRASE)
        .unwrap();
    let mut texts: Vec<_> = replaced.list().unwrap().iter().map(text_of).collect();
    texts.sort();
    assert_eq!(texts, ["Synthetic evening note.", "Synthetic kept entry."]);
}

/// local-data-protection — Safe restore: a backup that cannot be reached, on a disconnected
/// drive or behind an unreadable list of backups, is reported as unavailable rather than as a
/// wrong passphrase or an invalid backup, and the journal is unchanged.
#[test]
fn a_backup_that_cannot_be_reached_is_reported_as_unavailable() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    let drive = fixture.backups.path().join("synthetic drive");
    fs::create_dir(&drive).unwrap();
    app.choose_backup_folder(drive.clone(), noon()).unwrap();
    app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
        .unwrap();
    app.lock()
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic kept entry."))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let backup = app.lock().list_backups().unwrap().remove(0);
    let registered = || RestoreSource::Registered {
        name: backup.name.clone(),
    };
    let elsewhere = TempDir::new().unwrap();
    let copy = elsewhere.path().join("synthetic copy.ttd.age");
    fs::copy(drive.join(&backup.name), &copy).unwrap();
    app.lock()
        .save_entry(draft(
            "2026-11-22",
            Slot::Evening,
            "Synthetic evening note.",
        ))
        .unwrap();
    let unavailable = |source: RestoreSource| {
        let error = app
            .lock()
            .restore_backup(source, PASSPHRASE, false, noon())
            .unwrap_err();
        assert_eq!(error, CommandError::backup_unavailable());
        assert_eq!(app.lock().list_entries().unwrap().len(), 2);
    };

    // The drive is unplugged while its backups are listed in Settings.
    let unplugged = fixture.backups.path().join("unplugged");
    fs::rename(&drive, &unplugged).unwrap();
    unavailable(registered());
    fs::rename(&unplugged, &drive).unwrap();
    // The folder's list of backups was damaged since it was shown.
    let registry = drive.join(".through-the-days-backups.json");
    let listed = fs::read(&registry).unwrap();
    fs::write(&registry, b"synthetic damaged registry").unwrap();
    unavailable(registered());
    fs::write(&registry, listed).unwrap();
    // A picked file that was removed since it was chosen.
    app.lock().pick_restore_file(Some(copy.clone()));
    fs::remove_file(&copy).unwrap();
    unavailable(RestoreSource::Picked);

    assert_eq!(app.lock().list_backups().unwrap(), vec![backup]);
    assert!(
        names_in(&fixture.paths().data_dir)
            .iter()
            .all(|name| !name.starts_with(".ttd-"))
    );
}

/// local-data-protection — Safe restore: a private copy of the backup that cannot be written in
/// the data folder is a storage failure, not a wrong passphrase, and the journal is unchanged.
#[test]
fn a_restore_that_cannot_copy_its_backup_reports_a_storage_failure() {
    let fixture = Fixture::new();
    let app = ready_with_backups(&fixture);
    let kept = app
        .lock()
        .save_entry(draft("2026-11-22", Slot::Morning, "Synthetic kept entry."))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let backup = app.lock().list_backups().unwrap().remove(0);
    let data_dir = fixture.paths().data_dir;
    fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o500)).unwrap();
    let error = app
        .lock()
        .restore_backup(
            RestoreSource::Registered { name: backup.name },
            PASSPHRASE,
            false,
            noon(),
        )
        .unwrap_err();
    fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(error, CommandError::from(Error::Storage));
    assert_eq!(app.lock().list_entries().unwrap(), vec![kept]);
}

/// local-data-protection — Safe restore: a journal whose pages are damaged can be replaced from
/// a backup once the person confirms that it cannot be backed up first.
#[test]
fn a_damaged_journal_is_replaced_once_the_person_confirms_a_restore_without_a_safety_backup() {
    // Damage that stops the journal from being read, then damage that only stops its backup.
    for table in ["journal_entries", "preferences"] {
        let fixture = Fixture::new();
        let app = ready_with_backups(&fixture);
        fill(&app);
        app.lock().backup_now(noon()).unwrap();
        let backup = app.lock().list_backups().unwrap().remove(0);
        drop(app);
        let (offset, length) = root_page(&fixture.paths().journal, table);
        damage(&fixture.paths().journal, offset, length);
        let damaged = fixture.journal_bytes();

        let app = fixture.launch();
        assert_eq!(app.startup_status().state, StartupState::Ready, "{table}");
        app.set_backup_passphrase(secret(PASSPHRASE), false, noon())
            .unwrap();
        let source = || RestoreSource::Registered {
            name: backup.name.clone(),
        };
        let error = app
            .lock()
            .restore_backup(source(), WRONG_PASSPHRASE, false, noon())
            .unwrap_err();
        assert_eq!(error, CommandError::from(Error::Restore), "{table}");
        let error = app
            .lock()
            .restore_backup(source(), PASSPHRASE, false, noon())
            .unwrap_err();
        assert_eq!(error, CommandError::safety_backup_failed(), "{table}");
        assert_eq!(fixture.journal_bytes(), damaged, "{table}");
        assert_eq!(app.lock().list_backups().unwrap().len(), 1, "{table}");

        let outcome = app
            .lock()
            .restore_backup(source(), PASSPHRASE, true, noon())
            .unwrap();
        assert_eq!(
            outcome,
            RestoreOutcome {
                entries: 40,
                safety_backup: false,
                set_aside: None
            },
            "{table}"
        );
        assert_eq!(app.lock().list_entries().unwrap().len(), 40, "{table}");
        assert!(app.lock().preferences().is_ok(), "{table}");
    }
}

/// local-data-protection — Safe restore: when the journal cannot be opened at all, a backup file
/// replaces it from the startup screen, and the unreadable file is kept aside, never deleted.
#[test]
fn a_journal_that_cannot_be_opened_is_kept_aside_and_replaced_from_a_backup_file() {
    let original = Fixture::new();
    let app = ready_with_backups(&original);
    let kept = app
        .lock()
        .save_entry(draft(
            "2026-11-21",
            Slot::Evening,
            "Synthetic evening to recover.",
        ))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let backup = original
        .folder()
        .join(app.lock().list_backups().unwrap().remove(0).name);
    drop(app);

    for (create, state) in [
        (damaged_header as fn(&Path), StartupState::Failed),
        (not_a_database, StartupState::Failed),
        (newer_journal, StartupState::Unsupported),
    ] {
        let fixture = Fixture::new();
        let data_dir = fixture.paths().data_dir;
        fs::create_dir_all(&data_dir).unwrap();
        create(&fixture.paths().journal);
        let log = data_dir.join("journal.sqlite-wal");
        fs::write(&log, b"synthetic write-ahead log of the unreadable journal").unwrap();
        let unreadable = fixture.journal_bytes();
        let app = fixture.launch();
        assert_eq!(app.startup_status().state, state);

        // A backup file that cannot be read, or a wrong passphrase, moves nothing.
        let gone = original
            .folder()
            .join("ttd-1-on-an-unplugged-drive.ttd.age");
        app.lock().pick_restore_file(Some(gone));
        let error = app
            .lock()
            .restore_backup(RestoreSource::Picked, PASSPHRASE, false, noon())
            .unwrap_err();
        assert_eq!(error, CommandError::backup_unavailable());
        app.lock().pick_restore_file(Some(backup.clone()));
        let error = app
            .lock()
            .restore_backup(RestoreSource::Picked, WRONG_PASSPHRASE, false, noon())
            .unwrap_err();
        assert_eq!(error, CommandError::from(Error::Restore));
        assert_eq!(fixture.journal_bytes(), unreadable);
        assert_eq!(app.startup_status().state, state);

        let outcome = app
            .lock()
            .restore_backup(RestoreSource::Picked, PASSPHRASE, false, noon())
            .unwrap();
        let name = format!("journal.unreadable-{}.sqlite", noon().timestamp());
        assert_eq!(
            outcome,
            RestoreOutcome {
                entries: 1,
                safety_backup: false,
                set_aside: Some(name.clone())
            }
        );
        assert_eq!(fs::read(data_dir.join(&name)).unwrap(), unreadable);
        assert_eq!(
            fs::read(data_dir.join(format!("{name}-wal"))).unwrap(),
            b"synthetic write-ahead log of the unreadable journal"
        );
        let startup = app.startup_status();
        assert_eq!(
            (startup.state, startup.message),
            (StartupState::Ready, None)
        );
        assert_eq!(app.lock().list_entries().unwrap(), vec![kept.clone()]);
        drop(app);

        // The restored journal opens normally at the next launch; the unreadable one stays aside.
        let app = fixture.launch();
        assert_eq!(app.startup_status().state, StartupState::Ready);
        assert_eq!(app.lock().list_entries().unwrap(), vec![kept.clone()]);
        assert_eq!(fs::read(data_dir.join(&name)).unwrap(), unreadable);
    }
}

/// A synthetic write-ahead log beside a journal that cannot be opened.
const UNREADABLE_LOG: &[u8] = b"synthetic write-ahead log of the unreadable journal";

/// What a launch after an interrupted restore from the startup screen opened.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Reopened {
    /// The journal that could not be opened, unchanged, with its log.
    Unchanged,
    /// The complete restored journal, with the other one kept aside.
    Restored,
}

/// Checks a launch that followed an interrupted restore from the startup screen: it opened either
/// the journal that could not be opened, unchanged, or the complete restored journal with the
/// other one kept aside, never an empty journal, and no file of the restore remains.
fn reopened_after_interruption(
    fixture: &Fixture,
    app: &AppState,
    unopened: StartupState,
    unreadable: &[u8],
    kept: &Entry,
) -> Reopened {
    let data_dir = fixture.paths().data_dir;
    let names = names_in(&data_dir);
    assert!(
        names
            .iter()
            .all(|name| !name.starts_with(".ttd-") && name != "restore-in-progress.json"),
        "{names:?}"
    );
    let aside: Vec<&str> = names
        .iter()
        .map(String::as_str)
        .filter(|name| name.starts_with("journal.unreadable-"))
        .collect();
    let startup = app.startup_status();
    if startup.state != StartupState::Ready {
        assert_eq!(startup.state, unopened);
        assert_eq!(fixture.journal_bytes(), unreadable);
        assert_eq!(
            fs::read(data_dir.join("journal.sqlite-wal")).unwrap(),
            UNREADABLE_LOG
        );
        assert!(aside.is_empty(), "{names:?}");
        return Reopened::Unchanged;
    }
    assert_eq!(startup.message, None);
    assert_eq!(app.lock().list_entries().unwrap(), vec![kept.clone()]);
    let name = format!("journal.unreadable-{}.sqlite", noon().timestamp());
    assert!(
        aside.iter().all(|aside| aside.starts_with(&name)),
        "{names:?}"
    );
    assert_eq!(fs::read(data_dir.join(&name)).unwrap(), unreadable);
    assert_eq!(
        fs::read(data_dir.join(format!("{name}-wal"))).unwrap(),
        UNREADABLE_LOG
    );
    Reopened::Restored
}

/// local-data-protection — Safe restore / Interrupted restore: a restore from the startup screen
/// can stop at any moment, when the person quits or the Mac crashes or loses power. The next
/// launch opens either the journal that could not be opened, unchanged, or the complete restored
/// journal, never an empty one, and no restore file remains. A launch that stops while it
/// settles an interrupted restore leaves files that the following launch settles the same way.
#[test]
fn a_restore_from_the_startup_screen_that_stops_at_any_moment_never_opens_an_empty_journal() {
    let original = Fixture::new();
    let app = ready_with_backups(&original);
    let kept = app
        .lock()
        .save_entry(draft(
            "2026-11-21",
            Slot::Evening,
            "Synthetic evening to recover.",
        ))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let backup = original
        .folder()
        .join(app.lock().list_backups().unwrap().remove(0).name);
    drop(app);

    for (create, state) in [
        (damaged_header as fn(&Path), StartupState::Failed),
        (newer_journal, StartupState::Unsupported),
    ] {
        let fixture = Fixture::new();
        let data_dir = fixture.paths().data_dir;
        fs::create_dir_all(&data_dir).unwrap();
        create(&fixture.paths().journal);
        fs::write(data_dir.join("journal.sqlite-wal"), UNREADABLE_LOG).unwrap();
        let unreadable = fixture.journal_bytes();
        let app = fixture.launch();
        assert_eq!(app.startup_status().state, state);
        app.lock().pick_restore_file(Some(backup.clone()));

        let (outcome, stops) = copies_at_interruptions(&fixture, || {
            app.lock()
                .restore_backup(RestoreSource::Picked, PASSPHRASE, false, noon())
        });
        assert_eq!(outcome.unwrap().entries, 1);
        let mut reopened = Vec::new();
        for stop in &stops {
            let (app, launch_stops) = copies_at_interruptions(stop, || stop.launch());
            let first = reopened_after_interruption(stop, &app, state, &unreadable, &kept);
            for launch_stop in &launch_stops {
                let app = launch_stop.launch();
                let next =
                    reopened_after_interruption(launch_stop, &app, state, &unreadable, &kept);
                assert_eq!(next, first);
            }
            reopened.push(first);
        }
        // Stops before the restored journal takes the journal's place keep the journal as it
        // was; every later stop keeps the restored journal.
        let replaced = reopened
            .iter()
            .position(|outcome| *outcome == Reopened::Restored)
            .unwrap();
        assert!(replaced > 0, "{reopened:?}");
        assert!(
            reopened[replaced..]
                .iter()
                .all(|outcome| *outcome == Reopened::Restored),
            "{reopened:?}"
        );
    }
}

/// local-data-protection — Safe restore / Interrupted restore: when the marker of an interrupted
/// restore cannot be settled, the start fails rather than create an empty journal where one was
/// kept aside. Erasing all app data removes the marker.
#[test]
fn a_restore_marker_that_cannot_be_settled_fails_the_start_until_app_data_is_erased() {
    let fixture = Fixture::new();
    let paths = fixture.paths();
    fs::create_dir_all(&paths.data_dir).unwrap();
    let kept = paths.data_dir.join("journal.unreadable-1795363200.sqlite");
    damaged_header(&kept);
    fs::write(&paths.restore_marker, b"synthetic damaged marker").unwrap();

    let app = fixture.launch();
    let startup = app.startup_status();
    assert_eq!(
        (startup.state, startup.message.as_deref()),
        (StartupState::Failed, Some(OPEN_FAILED))
    );
    assert_eq!(app.retry_startup(noon()).state, StartupState::Failed);
    assert!(!paths.journal.exists());
    assert!(kept.exists());

    let startup = app.erase_app_data(ERASE_CONFIRMATION, noon()).unwrap();
    assert_eq!(startup.state, StartupState::Ready);
    assert!(!paths.restore_marker.exists());
    assert!(!kept.exists());
}

#[test]
fn a_new_mac_restores_with_only_the_backup_file_and_its_passphrase() {
    let original = Fixture::new();
    let app = ready_with_backups(&original);
    let morning = app
        .lock()
        .save_entry(draft(
            "2026-11-21",
            Slot::Morning,
            "Synthetic morning to recover.",
        ))
        .unwrap();
    let evening = app
        .lock()
        .save_entry(draft(
            "2026-11-21",
            Slot::Evening,
            "Synthetic evening to recover.",
        ))
        .unwrap();
    app.lock().backup_now(noon()).unwrap();
    let backup = original
        .folder()
        .join(app.lock().list_backups().unwrap().remove(0).name);

    // A clean Mac: no folder, no Keychain item, an empty journal.
    let clean = Fixture::new();
    let app = clean.launch();
    let picked = app.lock().pick_restore_file(Some(backup.clone())).unwrap();
    assert_eq!(
        Some(picked.name.as_str()),
        backup.file_name().and_then(|name| name.to_str())
    );
    let outcome = app
        .lock()
        .restore_backup(RestoreSource::Picked, PASSPHRASE, false, noon())
        .unwrap();
    assert_eq!(
        outcome,
        RestoreOutcome {
            entries: 2,
            safety_backup: false,
            set_aside: None
        }
    );
    assert_eq!(
        app.lock().entries_on("2026-11-21").unwrap(),
        vec![morning, evening]
    );
    // The picked file is used once; the backup folder of the clean Mac was never involved.
    let error = app
        .lock()
        .restore_backup(RestoreSource::Picked, PASSPHRASE, false, noon())
        .unwrap_err();
    assert_eq!(error, CommandError::backup_unavailable());
    assert!(names_in(&clean.folder()).is_empty());
    assert_eq!(app.lock().pick_restore_file(None), None);
}

#[test]
fn erasing_removes_app_data_and_secrets_but_never_the_backup_folder() {
    let fixture = Fixture::new();
    let app = fixture.launch();
    app.choose_backup_folder(fixture.folder(), noon()).unwrap();
    app.set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    app.lock()
        .save_entry(draft(
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
    // Leftover temporary copies, journals that a restore kept aside and the marker of an
    // interrupted restore are app data too.
    let leftovers = [
        ".ttd-incomplete-synthetic",
        ".ttd-restore-staging-synthetic",
        "journal.unreadable-1795363200.sqlite",
        "journal.unreadable-1795363200.sqlite-wal",
        "restore-in-progress.json",
    ]
    .map(|name| fixture.paths().data_dir.join(name));
    for leftover in &leftovers {
        fs::write(leftover, b"synthetic").unwrap();
    }

    let error = app.erase_app_data("erase", noon()).unwrap_err();
    assert_eq!(error, CommandError::confirmation());
    assert_eq!(app.lock().list_entries().unwrap().len(), 1);

    let startup = app.erase_app_data(ERASE_CONFIRMATION, noon()).unwrap();
    assert_eq!(startup.state, StartupState::Ready);
    assert!(app.lock().list_entries().unwrap().is_empty());
    assert!(!fixture.paths().plan.exists());
    assert!(leftovers.iter().all(|leftover| !leftover.exists()));
    assert_eq!(fixture.keychain.contents().item, None);
    let status = app.lock().backup_status(noon());
    assert_eq!(status.state, BackupState::NeedsFolder);
    assert!(!status.passphrase_available && !status.remembered);
    assert_eq!(names_in(&fixture.folder()), folder_before);
    drop(app);
    // The next launch finds the fresh journal and no remembered settings.
    let app = fixture.launch();
    assert!(app.lock().list_entries().unwrap().is_empty());
    assert_eq!(
        app.lock().backup_status(noon()).state,
        BackupState::NeedsFolder
    );
}

/// D-11: a Keychain error from erasing comes only after the journal and the backup settings were
/// erased and a fresh journal opened, so the interface can reload and name what remains.
#[test]
fn an_incomplete_erasure_is_reported_after_the_journal_and_settings_are_erased() {
    let fixture = Fixture::with_keychain(FakeKeychain::holding(PASSPHRASE));
    let app = fixture.launch();
    app.choose_backup_folder(fixture.folder(), noon()).unwrap();
    app.set_backup_passphrase(secret(PASSPHRASE), true, noon())
        .unwrap();
    app.lock()
        .save_entry(draft(
            "2026-11-22",
            Slot::Morning,
            "Synthetic entry to erase.",
        ))
        .unwrap();
    fixture.keychain.contents().failing = true;
    let error = app.erase_app_data(ERASE_CONFIRMATION, noon()).unwrap_err();
    assert_eq!(error, CommandError::keychain());
    assert_eq!(app.startup_status().state, StartupState::Ready);
    assert!(app.lock().list_entries().unwrap().is_empty());
    assert!(!fixture.paths().plan.exists());
    let status = app.lock().backup_status(noon());
    assert_eq!(status.state, BackupState::NeedsFolder);
    assert!(!status.passphrase_available && !status.remembered);
    // Only the Keychain item remains.
    assert_eq!(
        fixture.keychain.contents().item.as_deref(),
        Some(PASSPHRASE)
    );
}

#[test]
fn the_journal_closes_at_exit_only_when_no_operation_holds_it() {
    let fixture = Fixture::new();
    let state = fixture.launch();
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

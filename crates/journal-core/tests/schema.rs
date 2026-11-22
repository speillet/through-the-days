#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{NOW, PASSPHRASE, age_files, document, execute, previous_journal};
use journal_core::{Entry, Error, Journal, Slot, schema_version};
use std::fs;

/// local-data-protection — Recoverable pre-migration backup / Upgrade needs a passphrase.
#[test]
fn older_supported_journal_requires_migration_without_being_modified() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("previous.sqlite");
    let folder = directory.path().join("backups");
    fs::create_dir(&folder).unwrap();
    previous_journal(&path);
    let original = fs::read(&path).unwrap();
    assert_eq!(Journal::open(&path).err(), Some(Error::MigrationRequired));
    assert_eq!(schema_version(&path), Ok(Some(1)));
    assert_eq!(
        Journal::migrate_with_backup(&path, &folder, "too short", NOW).err(),
        Some(Error::Passphrase)
    );
    assert_eq!(fs::read(&path).unwrap(), original);
    assert!(age_files(&folder).is_empty());
    assert_eq!(Journal::open(&path).err(), Some(Error::MigrationRequired));
}

/// local-persistence — Safe migrations (newer or foreign files are never changed).
#[test]
fn newer_or_foreign_databases_are_unsupported_and_left_unchanged() {
    let directory = tempfile::tempdir().unwrap();
    let folder = directory.path().join("backups");
    fs::create_dir(&folder).unwrap();
    let journal_tables = "CREATE TABLE journal_entries(id TEXT PRIMARY KEY,entry_date TEXT,slot TEXT,revision INTEGER,payload TEXT);
        CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT);";
    let newer = directory.path().join("newer.sqlite");
    execute(&newer, &format!("{journal_tables} PRAGMA user_version=3;"));
    let foreign = directory.path().join("foreign.sqlite");
    execute(
        &foreign,
        "CREATE TABLE notes(body TEXT); INSERT INTO notes VALUES('Synthetic note');",
    );
    let current_without_tables = directory.path().join("other-v2.sqlite");
    execute(
        &current_without_tables,
        "CREATE TABLE other(value TEXT); PRAGMA user_version=2;",
    );
    let negative = directory.path().join("negative.sqlite");
    execute(
        &negative,
        &format!("{journal_tables} PRAGMA user_version=-1;"),
    );
    let text = directory.path().join("text.sqlite");
    fs::write(&text, "Synthetic plain text that is not a database at all.").unwrap();

    let cases = [
        (&newer, Ok(Some(3))),
        (&foreign, Ok(Some(0))),
        (&current_without_tables, Ok(Some(2))),
        (&negative, Err(Error::Unsupported)),
        (&text, Err(Error::Unsupported)),
    ];
    for (path, version) in cases {
        let original = fs::read(path).unwrap();
        assert_eq!(schema_version(path), version, "{}", path.display());
        assert_eq!(
            Journal::open(path).err(),
            Some(Error::Unsupported),
            "{}",
            path.display()
        );
        assert_eq!(
            Journal::migrate_with_backup(path, &folder, PASSPHRASE, NOW).err(),
            Some(Error::Unsupported),
            "{}",
            path.display()
        );
        assert_eq!(fs::read(path).unwrap(), original, "{}", path.display());
    }
    assert!(
        fs::read_dir(&folder).unwrap().next().is_none(),
        "no backup was attempted"
    );
    assert!(
        Error::Unsupported
            .to_string()
            .ends_with("It has not been changed.")
    );
}

/// local-data-protection — Recoverable pre-migration backup (a fresh database needs no snapshot).
#[test]
fn missing_or_empty_files_open_as_a_fresh_current_journal() {
    let directory = tempfile::tempdir().unwrap();
    let missing = directory.path().join("missing.sqlite");
    assert_eq!(schema_version(&missing), Ok(None));
    let journal = Journal::open(&missing).unwrap();
    assert!(journal.list().unwrap().is_empty());
    drop(journal);
    assert_eq!(schema_version(&missing), Ok(Some(2)));

    let empty = directory.path().join("empty.sqlite");
    fs::write(&empty, b"").unwrap();
    assert_eq!(schema_version(&empty), Ok(None));
    Journal::open(&empty).unwrap();
    assert_eq!(schema_version(&empty), Ok(Some(2)));

    let folder = directory.path().join("unused-backups");
    let fresh = directory.path().join("fresh.sqlite");
    let journal = Journal::migrate_with_backup(&fresh, &folder, PASSPHRASE, NOW).unwrap();
    assert!(journal.list().unwrap().is_empty());
    assert!(
        !folder.exists(),
        "a fresh journal is not a migration and needs no backup"
    );
}

/// local-persistence — Safe migrations (a current journal is opened, not migrated again).
#[test]
fn migrating_a_current_journal_simply_opens_it() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Morning);
    entry.document = document("Synthetic current entry.");
    let entry = journal.save(entry).unwrap();
    drop(journal);
    let folder = directory.path().join("absent-folder");
    let reopened = Journal::migrate_with_backup(&path, &folder, PASSPHRASE, NOW).unwrap();
    assert_eq!(reopened.get(&entry.id).unwrap(), entry);
}

/// local-persistence — Safe migrations / Migration failure;
/// local-data-protection — Recoverable pre-migration backup / Backup fails before migration.
#[test]
fn migration_that_cannot_complete_leaves_the_previous_journal_intact() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("previous.sqlite");
    let folder = directory.path().join("backups");
    fs::create_dir(&folder).unwrap();
    previous_journal(&path);
    let original = fs::read(&path).unwrap();

    let unwritable = directory.path().join("not-a-folder");
    fs::write(&unwritable, "Synthetic file where a folder was expected").unwrap();
    assert_eq!(
        Journal::migrate_with_backup(&path, &unwritable, PASSPHRASE, NOW).err(),
        Some(Error::Backup)
    );
    assert_eq!(fs::read(&path).unwrap(), original);

    let lock = rusqlite::Connection::open(&path).unwrap();
    lock.execute_batch("BEGIN IMMEDIATE").unwrap();
    assert_eq!(
        Journal::migrate_with_backup(&path, &folder, PASSPHRASE, NOW).err(),
        Some(Error::Storage)
    );
    lock.execute_batch("ROLLBACK").unwrap();
    drop(lock);
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(Journal::open(&path).err(), Some(Error::MigrationRequired));
    assert_eq!(schema_version(&path), Ok(Some(1)));
}

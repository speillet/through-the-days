#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{NOW, PASSPHRASE, age_files, previous_journal};
use journal_core::{Error, Journal, list_backups, schema_version};

/// local-persistence — Safe migrations / Upgrade fictional database;
/// local-data-protection — Recoverable pre-migration backup.
#[test]
fn existing_journal_waits_for_recovery_then_migrates_with_nullable_progress() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("previous.sqlite");
    let id = previous_journal(&path);
    let original = std::fs::read(&path).unwrap();
    assert_eq!(Journal::open(&path).err(), Some(Error::MigrationRequired));
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert!(
        Journal::migrate_with_backup(&path, &directory.path().join("missing"), PASSPHRASE, NOW)
            .is_err()
    );
    assert_eq!(std::fs::read(&path).unwrap(), original);
    let journal = Journal::migrate_with_backup(&path, directory.path(), PASSPHRASE, NOW).unwrap();
    let entry = journal.get(&id).unwrap();
    assert_eq!(entry.progress, None);
    assert_eq!(entry.date, "2026-11-22");
    assert_eq!(entry.mood, Some(3));
    assert_eq!(
        entry.reflection.difficulty,
        "Synthetic difficulty from the previous version."
    );
    assert_eq!(
        entry.document["content"][0]["content"][0]["text"],
        "Synthetic previous journal."
    );
    assert_eq!(age_files(directory.path()).len(), 1);
    assert_eq!(list_backups(directory.path()).unwrap().len(), 1);
    assert_eq!(schema_version(&path), Ok(Some(2)));
}

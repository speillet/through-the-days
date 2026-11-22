#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{document, names_in};
use journal_core::{Entry, Journal, Slot, erase_journal_files};
use std::fs;

/// Erasing application data removes the journal database and its SQLite companions only.
#[test]
fn erasing_journal_files_removes_the_database_and_its_companions_only() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Morning);
    entry.document = document("Synthetic entry to erase.");
    journal.save(entry).unwrap();
    drop(journal);
    for companion in [
        "journal.sqlite-wal",
        "journal.sqlite-shm",
        "journal.sqlite-journal",
    ] {
        fs::write(directory.path().join(companion), "Synthetic companion").unwrap();
    }
    fs::write(directory.path().join("backup-plan.json"), "{}").unwrap();
    fs::write(
        directory.path().join("journal.sqlite.notes"),
        "Synthetic unrelated file",
    )
    .unwrap();
    fs::create_dir(directory.path().join("backups")).unwrap();

    erase_journal_files(&path).unwrap();
    assert_eq!(
        names_in(directory.path()),
        ["backup-plan.json", "backups", "journal.sqlite.notes"]
    );
    erase_journal_files(&path).unwrap();

    let fresh = Journal::open(&path).unwrap();
    assert!(fresh.list().unwrap().is_empty());
}

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{NOW, PASSPHRASE, age_files, document};
use journal_core::{Entry, Error, Journal, Slot, list_backups, schema_version};
use std::{fs, os::unix::fs::FileExt, path::Path};

/// Overwrites `length` bytes at `offset` with a synthetic damage pattern, as a failing disk can.
fn damage(path: &Path, offset: u64, length: usize) {
    let file = fs::OpenOptions::new().write(true).open(path).unwrap();
    file.write_all_at(&vec![0xA5; length], offset).unwrap();
    file.sync_all().unwrap();
}

/// Writes a synthetic journal of 40 entries on 20 dates and closes it, so every page is in the
/// database file itself. Returns the entry identifiers.
fn closed_journal(path: &Path) -> Vec<String> {
    let journal = Journal::open(path).unwrap();
    let ids = (0..40)
        .map(|index| {
            let slot = if index % 2 == 0 {
                Slot::Morning
            } else {
                Slot::Evening
            };
            let mut entry = Entry::draft(&format!("2026-10-{:02}", 1 + index / 2), slot);
            entry.document = document(&format!(
                "Synthetic entry {index}: a fictional paragraph long enough to fill several database pages."
            ));
            entry.reflection.helped = "Synthetic help.".repeat(8);
            journal.save(entry).unwrap().id
        })
        .collect();
    drop(journal);
    ids
}

/// Byte offset and size of the page holding the root of the journal entries table.
fn entries_root_page(path: &Path) -> (u64, usize) {
    let connection = rusqlite::Connection::open(path).unwrap();
    let page_size: i64 = connection
        .pragma_query_value(None, "page_size", |row| row.get(0))
        .unwrap();
    let root: i64 = connection
        .query_row(
            "SELECT rootpage FROM sqlite_master WHERE name='journal_entries'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    (
        u64::try_from((root - 1) * page_size).unwrap(),
        usize::try_from(page_size).unwrap(),
    )
}

/// local-data-protection — Safe restore: a journal with a damaged page reports its reads as
/// damage rather than as a full disk, refuses a backup of the damaged content, and a validated
/// backup still replaces it.
#[test]
fn a_damaged_page_is_reported_as_damage_and_a_backup_still_replaces_it() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let folder = directory.path().join("backups");
    fs::create_dir(&folder).unwrap();
    let ids = closed_journal(&path);
    let backup = Journal::open(&path)
        .unwrap()
        .backup_to(&folder, PASSPHRASE, NOW)
        .unwrap();
    let (offset, length) = entries_root_page(&path);
    damage(&path, offset, length);

    let mut journal = Journal::open(&path).unwrap();
    assert_eq!(journal.list(), Err(Error::Damaged));
    assert_eq!(journal.trash_items().err(), Some(Error::Damaged));
    assert_eq!(journal.get(&ids[0]).err(), Some(Error::Damaged));
    assert_eq!(
        journal.backup_to(&folder, PASSPHRASE, NOW + 60).err(),
        Some(Error::Damaged)
    );
    assert_eq!(age_files(&folder), vec![backup.path.clone()]);
    assert_eq!(list_backups(&folder).unwrap().len(), 1);

    journal.restore_from(&backup.path, PASSPHRASE).unwrap();
    let restored = journal.list().unwrap();
    assert_eq!(restored.len(), 40);
    assert!(ids.iter().all(|id| journal.get(id).is_ok()));
    drop(journal);
    assert_eq!(Journal::open(&path).unwrap().list().unwrap(), restored);
}

/// local-persistence — Safe migrations (unreadable files are never changed): a damaged header
/// or schema is reported as damage, distinct from a newer or foreign journal, and left as it is.
#[test]
fn damaged_headers_and_schemas_are_reported_as_damage_and_never_changed() {
    let directory = tempfile::tempdir().unwrap();
    let folder = directory.path().join("backups");
    fs::create_dir(&folder).unwrap();

    let text = directory.path().join("text.sqlite");
    fs::write(
        &text,
        "Synthetic plain text where the journal database should be.",
    )
    .unwrap();
    let header = directory.path().join("header.sqlite");
    closed_journal(&header);
    damage(&header, 0, 16);
    let schema = directory.path().join("schema.sqlite");
    closed_journal(&schema);
    // Page 1 holds the 100-byte file header, then the table of schema definitions.
    damage(&schema, 100, 300);

    for path in [&text, &header, &schema] {
        let original = fs::read(path).unwrap();
        assert_eq!(
            schema_version(path),
            Err(Error::Damaged),
            "{}",
            path.display()
        );
        assert_eq!(
            Journal::open(path).err(),
            Some(Error::Damaged),
            "{}",
            path.display()
        );
        assert_eq!(
            Journal::migrate_with_backup(path, &folder, PASSPHRASE, NOW).err(),
            Some(Error::Damaged),
            "{}",
            path.display()
        );
        assert_eq!(fs::read(path).unwrap(), original, "{}", path.display());
    }
    assert!(
        fs::read_dir(&folder).unwrap().next().is_none(),
        "no backup was attempted"
    );
}

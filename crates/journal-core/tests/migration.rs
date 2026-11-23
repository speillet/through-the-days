#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{
    NOW, PASSPHRASE, V1_ENTRY_PAYLOAD, V2_ENTRY_ID, V2_ENTRY_PAYLOAD, age_files, previous_journal,
};
use journal_core::{Depth, Entry, Error, Journal, Slot, list_backups, schema_version};
use serde_json::Value;

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
    assert_eq!(schema_version(&path), Ok(Some(3)));
    drop(journal);

    // The upgrade step itself records the missing answer: `progress` defaults when it is absent,
    // so only the stored payload shows that the step ran.
    assert!(!V1_ENTRY_PAYLOAD.contains("progress"));
    let stored: String = rusqlite::Connection::open(&path)
        .unwrap()
        .query_row(
            "SELECT payload FROM journal_entries WHERE id=?1",
            [&id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(stored.contains(r#""progress":null"#), "{stored}");
    let stored: Value = serde_json::from_str(&stored).unwrap();
    let mut expected: Value = serde_json::from_str(V1_ENTRY_PAYLOAD).unwrap();
    expected["progress"] = Value::Null;
    assert_eq!(stored, expected, "nothing else in the payload changed");
}

/// local-persistence — Safe migrations: entries stored by the current schema version keep
/// loading. A field removed, renamed or added without a default fails here, before a later
/// version could ship without the migration step it needs.
#[test]
fn frozen_current_version_payload_still_loads_with_every_field() {
    let entry: Entry = serde_json::from_str(V2_ENTRY_PAYLOAD).unwrap();
    assert_eq!(
        (entry.id.as_str(), entry.date.as_str(), entry.slot),
        (V2_ENTRY_ID, "2026-11-21", Slot::Evening)
    );
    assert_eq!(
        (
            entry.revision,
            entry.mood,
            entry.energy,
            entry.pride,
            entry.progress
        ),
        (3, Some(6), Some(5), Some(7), Some(8))
    );
    assert!(entry.complete && entry.can_complete());
    assert_eq!(
        (
            entry.title.as_str(),
            entry.emotion.as_str(),
            entry.another_emotion.as_str()
        ),
        ("Synthetic title", "calm", "Synthetic: serein")
    );
    assert_eq!(entry.depth, Depth::Deep);
    assert_eq!(entry.reflection.intention, "Synthetic intention");
    assert_eq!(entry.reflection.proud_of, "Synthetic pride");
    assert_eq!(entry.reflection.difficulty, "Synthetic difficulty");
    assert_eq!(entry.reflection.next_step, "Synthetic next step");
    assert_eq!(entry.reflection.helped, "Synthetic help");
    assert_eq!(entry.reflection.learned, "Synthetic lesson");
    assert_eq!(
        (
            entry.actions[0].id.as_str(),
            entry.actions[0].category.as_str()
        ),
        ("action-synthetic-walk", "walking")
    );
    assert_eq!(
        (
            entry.wins[0].origin.as_str(),
            entry.wins[0].include_in_insights
        ),
        ("pride", true)
    );
    assert_eq!(entry.created_time_zone, "Europe/London");
    assert_eq!(entry.document["content"][0]["attrs"]["level"], 2);
    assert_eq!(
        entry.document["content"][1]["content"][0]["marks"][0]["type"],
        "bold"
    );

    // Saving it again writes back every stored field unchanged; later versions may add fields.
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let saved = journal
        .save(Entry {
            revision: 0,
            ..entry.clone()
        })
        .unwrap();
    assert_eq!(saved.revision, 1);
    let written = serde_json::to_value(Entry {
        revision: entry.revision,
        ..saved
    })
    .unwrap();
    let frozen: Value = serde_json::from_str(V2_ENTRY_PAYLOAD).unwrap();
    for (field, value) in frozen.as_object().unwrap() {
        assert_eq!(&written[field], value, "{field}");
    }
}

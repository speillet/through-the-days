#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{
    BACKUP_MAGIC, NOW, PASSPHRASE, V1_ENTRY_PAYLOAD, V2_ENTRY_ID, V2_ENTRY_PAYLOAD, V2_TRASHED_AT,
    V2_TRASHED_ENTRY_PAYLOAD, age_files, decrypt, image_user_version, previous_journal,
    version_2_journal,
};
use journal_core::{
    Depth, Entry, Error, Journal, Milestone, Preferences, Slot, list_backups, schema_version,
};
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

/// local-persistence — Safe migrations / Upgrade fictional database, from a journal exactly as
/// version 2 stored it; local-data-protection — Recoverable pre-migration backup.
///
/// Every journal of the release before weekly reviews takes this upgrade. Its entries load as
/// they were stored, the trashed one keeps its deletion time, the preferences keep every field,
/// and each upgraded entry stays included in insights, so Trends and Weekly Review count it.
#[test]
fn version_2_journal_waits_for_recovery_then_upgrades_with_its_trash_and_preferences() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("previous.sqlite");
    version_2_journal(&path);
    let original = std::fs::read(&path).unwrap();
    assert_eq!(original[18..20], [2, 2], "a write-ahead-log journal file");
    assert_eq!(schema_version(&path), Ok(Some(2)));
    assert_eq!(Journal::open(&path).err(), Some(Error::MigrationRequired));
    assert_eq!(std::fs::read(&path).unwrap(), original);

    let journal = Journal::migrate_with_backup(&path, directory.path(), PASSPHRASE, NOW).unwrap();
    assert_eq!(schema_version(&path), Ok(Some(3)));
    let backups = age_files(directory.path());
    assert_eq!(backups.len(), 1);
    let plaintext = decrypt(&backups[0], PASSPHRASE);
    assert_eq!(
        image_user_version(&plaintext[BACKUP_MAGIC.len() + 1..]),
        2,
        "the pre-migration backup holds the version-2 journal"
    );

    // Neither stored entry chose whether to be included in insights: version 2 had no choice.
    for payload in [V2_ENTRY_PAYLOAD, V2_TRASHED_ENTRY_PAYLOAD] {
        let stored: Value = serde_json::from_str(payload).unwrap();
        assert_eq!(stored.get("includeInInsights"), None);
    }
    let entries = journal.list().unwrap();
    assert_eq!(
        entries,
        vec![serde_json::from_str::<Entry>(V2_ENTRY_PAYLOAD).unwrap()]
    );
    assert!(entries[0].include_in_insights);
    let trash = journal.trash_items().unwrap();
    assert_eq!(trash.len(), 1);
    assert_eq!(
        trash[0].entry,
        serde_json::from_str::<Entry>(V2_TRASHED_ENTRY_PAYLOAD).unwrap()
    );
    assert_eq!(trash[0].deleted_at, V2_TRASHED_AT);
    assert!(trash[0].entry.include_in_insights);
    let week = journal.weekly_review("2026-11-21").unwrap();
    assert_eq!(
        (
            week.report.entries,
            week.report.mood.observations,
            week.report.wins
        ),
        (1, 1, 1),
        "Weekly Review and Trends count the upgraded entry"
    );
    assert_eq!(
        journal.preferences().unwrap(),
        Preferences {
            time_zone: "Europe/London".into(),
            theme: "dark".into(),
            gentle: true,
            show_durations: false,
            show_toolbar: false,
            show_scores: false,
            sidebar_open: false,
            reduce_motion: true,
            default_depth: Depth::Deep,
            show_word_count: true,
            text_scale: 130,
            ..Preferences::default()
        }
    );

    // The upgraded journal holds weekly notes and milestones like a new one.
    assert!(!journal.holds_reading_records().unwrap());
    journal
        .save_weekly_notes("2026-11-21", "Synthetic notes after the upgrade.", 0)
        .unwrap();
    journal
        .save_milestone(Milestone::new("2026-11-21", "Synthetic milestone"))
        .unwrap();
    assert!(journal.holds_reading_records().unwrap());
}

/// local-persistence — Safe migrations: entries stored by version 2 keep loading. A field
/// removed, renamed or added without a default fails here, before a later version could ship
/// without the migration step it needs.
#[test]
fn frozen_version_2_payload_still_loads_with_every_field() {
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

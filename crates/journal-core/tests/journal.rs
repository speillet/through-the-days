use journal_core::{Entry, Journal, Slot};
use serde_json::json;

#[test]
fn acknowledged_morning_draft_survives_restart() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut draft = Entry::draft("2026-11-22", Slot::Morning);
    // Deliberate multilingual synthetic fixture.
    draft.document = json!({"type":"doc","content":[{"type":"paragraph","content":[
        {"type":"text","text":"Fictional journal: une journée paisible 🌿"}
    ]}]});
    let saved = journal.save(draft).unwrap();
    drop(journal);
    let reopened = Journal::open(&path).unwrap();
    assert_eq!(reopened.get(&saved.id).unwrap(), saved);
}

#[test]
fn optional_reflection_and_confirmed_wins_share_an_acknowledged_revision() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut draft = Entry::draft("2026-11-22", Slot::Evening);
    draft.pride = Some(8);
    draft.progress = Some(9);
    draft.reflection.proud_of = "Synthetic: made time to read.".into();
    draft.reflection.helped = "A quiet room.".into();
    draft.reflection.learned = "Short breaks helped.".into();
    draft.actions.push(journal_core::Action { id: "action-a".into(), text: "Rest".into(), category: "rest".into() });
    assert!(draft.wins.is_empty());
    draft.promote_pride();
    draft.promote_pride();
    assert_eq!(draft.wins.len(), 1);
    let mut saved = journal.save(draft).unwrap();
    saved.depth = journal_core::Depth::Quick;
    let saved = journal.save(saved).unwrap();
    drop(journal);
    let reopened = Journal::open(&path).unwrap().get(&saved.id).unwrap();
    assert_eq!(reopened, saved);
    assert_eq!(reopened.pride, Some(8));
    assert_eq!(reopened.progress, Some(9));
    assert_eq!(reopened.mood, None);
    let mut invalid = reopened;
    invalid.progress = Some(0);
    assert!(Journal::open(&path).unwrap().save(invalid).is_err());
}

#[test]
fn independent_slots_validate_scores_and_completion_without_overwriting_dates() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    morning.mood = Some(0);
    morning.energy = Some(10);
    morning.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic morning."}]}]});
    morning.complete = true;
    let morning = journal.save(morning).unwrap();
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.mood = Some(7);
    evening.energy = Some(6);
    let evening = journal.save(evening).unwrap();
    let mut invalid = evening.clone();
    invalid.mood = Some(11);
    assert!(journal.save(invalid).is_err());
    assert_eq!(journal.get(&evening.id).unwrap().mood, Some(7));
    let mut conflict = evening.clone();
    conflict.slot = Slot::Morning;
    assert!(journal.save(conflict).is_err());
    assert_eq!(journal.get(&morning.id).unwrap().energy, Some(10));
    let mut moved = evening;
    moved.date = "2026-11-21".into();
    let moved = journal.save(moved).unwrap();
    assert_eq!(moved.date, "2026-11-21");
    let mut cleared = morning;
    cleared.document = json!({"type":"doc","content":[{"type":"paragraph"}]});
    let cleared = journal.save(cleared).unwrap();
    assert!(!cleared.complete);
    assert_eq!(cleared.energy, Some(10));
}

#[test]
fn stale_or_locked_save_keeps_the_last_acknowledged_aggregate() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let first = journal.save(Entry::draft("2026-11-22", Slot::Morning)).unwrap();
    let mut second = first.clone();
    second.mood = Some(4);
    second.reflection.helped = "Synthetic quiet walk".into();
    let second = journal.save(second).unwrap();
    assert!(journal.save(first).is_err());
    let lock = rusqlite::Connection::open(&path).unwrap();
    lock.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut pending = second.clone();
    pending.mood = Some(8);
    pending.reflection.helped = "Synthetic changed answer".into();
    assert!(journal.save(pending.clone()).is_err());
    lock.execute_batch("ROLLBACK").unwrap();
    assert_eq!(journal.get(&second.id).unwrap(), second);
    let retried = journal.save(pending).unwrap();
    assert_eq!(retried.mood, Some(8));
}

#[test]
fn trash_hides_sources_restores_only_free_slots_and_expires_after_thirty_days() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let entry = journal.save(Entry::draft("2026-11-22", Slot::Morning)).unwrap();
    let now = 1_795_363_200_i64;
    journal.trash(&entry.id, entry.revision, now).unwrap();
    assert!(journal.list().unwrap().is_empty());
    assert!(journal.get(&entry.id).is_err());
    let replacement = journal.save(Entry::draft("2026-11-22", Slot::Morning)).unwrap();
    assert!(journal.restore(&entry.id).is_err());
    journal.trash(&replacement.id, replacement.revision, now).unwrap();
    journal.permanently_delete(&replacement.id).unwrap();
    let restored = journal.restore(&entry.id).unwrap();
    assert_eq!(restored.date, "2026-11-22");
    journal.trash(&restored.id, restored.revision, now).unwrap();
    journal.purge_expired(now + 30 * 86_400 - 1).unwrap();
    assert_eq!(journal.trash_items().unwrap().len(), 1);
    journal.purge_expired(now + 30 * 86_400).unwrap();
    assert!(journal.trash_items().unwrap().is_empty());
    assert!(journal.restore(&entry.id).is_err());
}

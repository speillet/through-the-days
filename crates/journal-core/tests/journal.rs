#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{DAY, NOW, contains, document};
use journal_core::{Action, Depth, Entry, Error, Journal, Preferences, Slot, Win};
use serde_json::json;

fn temporary_journal() -> (tempfile::TempDir, Journal) {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    (directory, journal)
}

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
    draft.actions.push(Action {
        id: "action-a".into(),
        text: "Rest".into(),
        category: "rest".into(),
    });
    assert!(draft.wins.is_empty());
    draft.promote_pride();
    draft.promote_pride();
    assert_eq!(draft.wins.len(), 1);
    let mut saved = journal.save(draft).unwrap();
    saved.depth = Depth::Quick;
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
    morning.document = document("Synthetic morning.");
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
    let first = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let mut second = first.clone();
    second.mood = Some(4);
    second.reflection.helped = "Synthetic quiet walk".into();
    let second = journal.save(second).unwrap();
    assert_eq!(journal.save(first), Err(Error::Conflict));
    let lock = rusqlite::Connection::open(&path).unwrap();
    lock.execute_batch("BEGIN IMMEDIATE").unwrap();
    let mut pending = second.clone();
    pending.mood = Some(8);
    pending.reflection.helped = "Synthetic changed answer".into();
    assert_eq!(journal.save(pending.clone()), Err(Error::Storage));
    lock.execute_batch("ROLLBACK").unwrap();
    assert_eq!(journal.get(&second.id).unwrap(), second);
    let retried = journal.save(pending).unwrap();
    assert_eq!(retried.mood, Some(8));
}

#[test]
fn trash_hides_sources_restores_only_free_slots_and_expires_after_thirty_days() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let entry = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let now = NOW;
    journal.trash(&entry.id, entry.revision, now).unwrap();
    assert!(journal.list().unwrap().is_empty());
    assert!(journal.get(&entry.id).is_err());
    let replacement = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    assert!(journal.restore(&entry.id).is_err());
    journal
        .trash(&replacement.id, replacement.revision, now)
        .unwrap();
    journal.permanently_delete(&replacement.id).unwrap();
    let restored = journal.restore(&entry.id).unwrap();
    assert_eq!(restored.date, "2026-11-22");
    journal.trash(&restored.id, restored.revision, now).unwrap();
    let trash = journal.trash_items().unwrap();
    assert_eq!(
        (trash[0].deleted_at, trash[0].expires_at),
        (now, now + 30 * DAY)
    );
    journal.purge_expired(now + 30 * DAY - 1).unwrap();
    assert_eq!(journal.trash_items().unwrap().len(), 1);
    journal.purge_expired(now + 30 * DAY).unwrap();
    assert!(journal.trash_items().unwrap().is_empty());
    assert_eq!(journal.restore(&entry.id), Err(Error::NotFound));
}

/// journal-entries — Two independent slots / Independent observations.
#[test]
fn morning_and_evening_keep_independent_observations_after_reopening() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    (morning.mood, morning.energy) = (Some(2), Some(3));
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    (evening.mood, evening.energy) = (Some(7), Some(6));
    let evening = journal.save(evening).unwrap();
    let morning = journal.save(morning).unwrap();
    drop(journal);
    let day = Journal::open(&path)
        .unwrap()
        .entries_on("2026-11-22")
        .unwrap();
    assert_eq!(day, vec![morning, evening]);
    assert_eq!((day[0].mood, day[0].energy), (Some(2), Some(3)));
    assert_eq!((day[1].mood, day[1].energy), (Some(7), Some(6)));
}

/// journal-entries — Two independent slots / Occupied destination.
#[test]
fn creating_or_moving_into_an_occupied_slot_is_refused_without_overwriting() {
    let (_directory, journal) = temporary_journal();
    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    morning.document = document("Synthetic first morning.");
    let morning = journal.save(morning).unwrap();
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.mood = Some(6);
    let evening = journal.save(evening).unwrap();
    let mut earlier = Entry::draft("2026-11-21", Slot::Morning);
    earlier.energy = Some(4);
    let earlier = journal.save(earlier).unwrap();

    let mut duplicate = Entry::draft("2026-11-22", Slot::Morning);
    duplicate.document = document("Synthetic duplicate morning.");
    assert_eq!(journal.save(duplicate), Err(Error::Occupied));
    let mut slot_move = evening.clone();
    slot_move.slot = Slot::Morning;
    assert_eq!(journal.save(slot_move), Err(Error::Occupied));
    let mut date_move = earlier.clone();
    date_move.date = "2026-11-22".into();
    assert_eq!(journal.save(date_move), Err(Error::Occupied));

    assert_eq!(journal.get(&morning.id).unwrap(), morning);
    assert_eq!(journal.get(&evening.id).unwrap(), evening);
    assert_eq!(journal.get(&earlier.id).unwrap(), earlier);
    assert_eq!(journal.list().unwrap().len(), 3);
}

/// journal-entries — Two independent slots / One entry is enough.
#[test]
fn one_entry_is_enough_and_the_other_slot_stays_empty() {
    let (_directory, journal) = temporary_journal();
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.document = document("Synthetic: only an evening entry today.");
    let evening = journal.save(evening).unwrap();
    let day = journal.entries_on("2026-11-22").unwrap();
    assert_eq!(day, vec![evening]);
    let only = &day[0];
    assert_eq!(
        (only.mood, only.energy, only.pride, only.progress),
        (None, None, None, None)
    );
    assert_eq!(journal.list().unwrap().len(), 1);
}

/// journal-entries — entries for one journal date (desktop command `entries_on`).
#[test]
fn entries_on_validates_the_date_and_lists_active_entries_morning_first() {
    let (_directory, journal) = temporary_journal();
    for invalid in [
        "2026-02-30",
        "22/11/2026",
        "2026-11-5",
        "",
        "2026-11-22T10:00",
    ] {
        assert_eq!(journal.entries_on(invalid), Err(Error::Date), "{invalid}");
    }
    let evening = journal
        .save(Entry::draft("2026-11-22", Slot::Evening))
        .unwrap();
    let morning = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let other_day = journal
        .save(Entry::draft("2026-11-23", Slot::Morning))
        .unwrap();
    assert_eq!(
        journal.entries_on("2026-11-22").unwrap(),
        vec![morning.clone(), evening.clone()]
    );
    assert_eq!(journal.entries_on("2026-11-23").unwrap(), vec![other_day]);
    assert!(journal.entries_on("2026-11-24").unwrap().is_empty());
    journal.trash(&evening.id, evening.revision, NOW).unwrap();
    assert_eq!(journal.entries_on("2026-11-22").unwrap(), vec![morning]);
}

/// journal-entries — Chosen civil date / Writing after midnight, Open entry crosses midnight, Travel.
#[test]
fn chosen_date_survives_midnight_and_time_zone_changes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let preferences = Preferences::default();
    let half_past_midnight = "2026-11-22T23:30:00Z".parse().unwrap();
    assert_eq!(
        preferences.journal_date(half_past_midnight).unwrap(),
        "2026-11-23"
    );
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.created_time_zone = preferences.time_zone.clone();
    entry.document = document("Synthetic: written after midnight about the previous day.");
    let saved = journal.save(entry).unwrap();
    let mut continued = saved.clone();
    continued.document = document("Synthetic: still writing as the clock moves on.");
    let continued = journal.save(continued).unwrap();
    assert_eq!(
        (continued.date.as_str(), continued.slot),
        ("2026-11-22", Slot::Evening)
    );
    let mut travelling = preferences;
    travelling.time_zone = "Asia/Tokyo".into();
    journal.set_preferences(&travelling).unwrap();
    drop(journal);
    let reopened = Journal::open(&path).unwrap().get(&saved.id).unwrap();
    assert_eq!(reopened, continued);
    assert_eq!(reopened.created_time_zone, "Europe/Paris");
}

/// journal-entries — Partial drafts / Writing only, Check-in only; daily-check-in — Tired person skips.
#[test]
fn writing_only_and_check_in_only_drafts_are_recoverable_without_invented_answers() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let mut writing = Entry::draft("2026-11-22", Slot::Morning);
    writing.document = document("Synthetic: writing straight away, no check-in.");
    let writing = journal.save(writing).unwrap();
    let mut check_in = Entry::draft("2026-11-22", Slot::Evening);
    check_in.actions.push(Action {
        id: "action-walk".into(),
        text: "Walked".into(),
        category: "walking".into(),
    });
    let check_in = journal.save(check_in).unwrap();
    drop(journal);
    let journal = Journal::open(&path).unwrap();
    let writing_again = journal.get(&writing.id).unwrap();
    assert_eq!(writing_again, writing);
    assert!(!writing_again.complete);
    assert_eq!(
        (
            writing_again.mood,
            writing_again.energy,
            writing_again.pride
        ),
        (None, None, None)
    );
    assert!(writing_again.actions.is_empty() && writing_again.wins.is_empty());
    assert_eq!(writing_again.reflection, Default::default());
    let check_in_again = journal.get(&check_in.id).unwrap();
    assert_eq!(check_in_again, check_in);
    assert!(
        journal_core::document_text(&check_in_again.document)
            .trim()
            .is_empty()
    );
}

/// journal-entries — Completion integrity / Incomplete completion request, Valid completion.
#[test]
fn completion_requires_writing_mood_and_energy_and_a_refusal_keeps_the_draft() {
    let (_directory, journal) = temporary_journal();
    let mut draft = Entry::draft("2026-11-22", Slot::Evening);
    draft.document = document("Synthetic evening words.");
    draft.mood = Some(0);
    let draft = journal.save(draft).unwrap();

    let mut missing_energy = draft.clone();
    missing_energy.complete = true;
    let refusal = journal.save(missing_energy).unwrap_err();
    assert_eq!(refusal, Error::Completion);
    assert!(
        refusal
            .to_string()
            .starts_with("Add some writing, a mood score and an energy score")
    );
    let mut empty_writing = draft.clone();
    empty_writing.energy = Some(10);
    empty_writing.document = document("   ");
    empty_writing.complete = true;
    assert_eq!(journal.save(empty_writing), Err(Error::Completion));
    assert_eq!(journal.get(&draft.id).unwrap(), draft);

    let mut valid = draft;
    valid.energy = Some(10);
    valid.complete = true;
    let completed = journal.save(valid).unwrap();
    assert!(completed.complete);
    assert_eq!(
        (completed.mood, completed.energy, completed.pride),
        (Some(0), Some(10), None)
    );
    assert_eq!(journal.get(&completed.id).unwrap(), completed);
}

/// journal-entries — Safe content editing / Cleared writing (completion invariant after edits).
#[test]
fn edits_that_invalidate_a_completed_entry_return_it_to_draft_with_answers_intact() {
    let (_directory, journal) = temporary_journal();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.document = document("Synthetic completed reflection.");
    (entry.mood, entry.energy, entry.pride) = (Some(6), Some(5), Some(7));
    entry.reflection.difficulty = "Synthetic difficulty.".into();
    entry.actions.push(Action {
        id: "action-read".into(),
        text: "Read".into(),
        category: "reading".into(),
    });
    entry.complete = true;
    let completed = journal.save(entry).unwrap();
    assert!(completed.complete);

    let mut cleared = completed.clone();
    cleared.document = json!({"type": "doc", "content": [{"type": "paragraph"}]});
    let cleared = journal.save(cleared).unwrap();
    assert!(!cleared.complete);
    assert_eq!(
        (cleared.mood, cleared.energy, cleared.pride),
        (Some(6), Some(5), Some(7))
    );
    assert_eq!(cleared.reflection, completed.reflection);
    assert_eq!(cleared.actions, completed.actions);

    let mut rewritten = cleared;
    rewritten.document = document("Synthetic words again.");
    rewritten.complete = true;
    let rewritten = journal.save(rewritten).unwrap();
    assert!(rewritten.complete);
    let mut mood_removed = rewritten;
    mood_removed.mood = None;
    let mood_removed = journal.save(mood_removed).unwrap();
    assert!(!mood_removed.complete);
    assert_eq!(journal.get(&mood_removed.id).unwrap(), mood_removed);
}

/// daily-check-in — Independent momentary scores / Range boundaries, Invalid score;
/// Optional pride and reflection / Invalid pride; Optional perceived progress / Invalid progress value.
#[test]
fn invalid_scores_are_rejected_without_changing_saved_answers() {
    let (_directory, journal) = temporary_journal();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    (entry.mood, entry.energy, entry.pride, entry.progress) =
        (Some(0), Some(10), Some(1), Some(10));
    entry.reflection.difficulty = "Synthetic difficulty kept safe.".into();
    let saved = journal.save(entry).unwrap();
    assert_eq!((saved.mood, saved.energy), (Some(0), Some(10)));

    type MakeInvalid = fn(&mut Entry);
    let invalid_values: [(&str, MakeInvalid); 8] = [
        ("mood 11", |e| e.mood = Some(11)),
        ("mood -1", |e| e.mood = Some(-1)),
        ("energy 11", |e| e.energy = Some(11)),
        ("energy -1", |e| e.energy = Some(-1)),
        ("pride 0", |e| e.pride = Some(0)),
        ("pride 11", |e| e.pride = Some(11)),
        ("progress 0", |e| e.progress = Some(0)),
        ("progress 11", |e| e.progress = Some(11)),
    ];
    for (label, make_invalid) in invalid_values {
        let mut invalid = saved.clone();
        make_invalid(&mut invalid);
        invalid.reflection.difficulty = "Synthetic answer that must not be saved.".into();
        assert_eq!(journal.save(invalid), Err(Error::Score), "{label}");
        assert_eq!(journal.get(&saved.id).unwrap(), saved, "{label}");
    }
    for (field, fraction) in [
        ("mood", 2.5),
        ("energy", 10.0),
        ("pride", 7.5),
        ("progress", 1.5),
    ] {
        let mut submitted = serde_json::to_value(&saved).unwrap();
        submitted[field] = json!(fraction);
        assert!(
            serde_json::from_value::<Entry>(submitted).is_err(),
            "{field} {fraction}"
        );
    }
    assert_eq!(journal.get(&saved.id).unwrap(), saved);
}

/// daily-check-in — Nuanced emotion labels / Label differs from quadrant (vocabulary identifiers).
#[test]
fn emotion_comes_from_the_vocabulary_or_the_persons_own_words() {
    let (_directory, journal) = temporary_journal();
    let mut entry = Entry::draft("2026-11-22", Slot::Morning);
    (entry.mood, entry.energy) = (Some(3), Some(2));
    entry.emotion = "anxious".into();
    let saved = journal.save(entry).unwrap();
    let stored = journal.get(&saved.id).unwrap();
    assert_eq!(
        (stored.emotion.as_str(), stored.mood, stored.energy),
        ("anxious", Some(3), Some(2))
    );

    for unknown in ["Anxious", "elated-beyond-words", " anxious"] {
        let mut invalid = saved.clone();
        invalid.emotion = unknown.into();
        assert_eq!(journal.save(invalid), Err(Error::Emotion), "{unknown}");
        assert_eq!(journal.get(&saved.id).unwrap(), saved);
    }

    let mut own_words = saved;
    own_words.emotion = String::new();
    // Deliberate multilingual synthetic fixture: the person's own words in French and Japanese.
    own_words.another_emotion = "Synthetic: un peu mélancolique, 少し寂しい".into();
    let own_words = journal.save(own_words).unwrap();
    let stored = journal.get(&own_words.id).unwrap();
    assert_eq!(
        stored.another_emotion,
        "Synthetic: un peu mélancolique, 少し寂しい"
    );
    assert_eq!((stored.mood, stored.energy), (Some(3), Some(2)));
}

/// daily-check-in — Reported actions and intentions / Rest and reading, Morning reflection;
/// User-owned small wins / Rest without reinterpretation, Optional reflective prompts.
#[test]
fn reported_actions_stay_separate_from_intentions_and_rest_is_not_a_win() {
    let (_directory, journal) = temporary_journal();
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.actions = vec![
        Action {
            id: "action-rest".into(),
            text: "Rested".into(),
            category: "rest".into(),
        },
        Action {
            id: "action-read".into(),
            text: "Read a chapter".into(),
            category: "reading".into(),
        },
    ];
    evening.reflection.next_step = "Synthetic: a short walk tomorrow".into();
    evening.promote_pride();
    let evening = journal.save(evening).unwrap();
    assert_eq!(evening.actions.len(), 2);
    assert!(evening.wins.is_empty());
    assert!(
        evening
            .actions
            .iter()
            .all(|action| !action.text.contains("walk"))
    );

    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    morning.reflection.intention = "Synthetic: try a short walk".into();
    morning.document = document("Synthetic morning thoughts.");
    (morning.mood, morning.energy) = (Some(5), Some(4));
    morning.complete = true;
    let morning = journal.save(morning).unwrap();
    assert!(morning.complete);
    assert!(morning.actions.is_empty() && morning.wins.is_empty());
    assert!(morning.reflection.helped.is_empty() && morning.reflection.learned.is_empty());
}

/// daily-check-in — Writing depth preserves entry identity / Switch a partial draft.
#[test]
fn switching_writing_depth_keeps_one_entry_and_its_content() {
    let (_directory, journal) = temporary_journal();
    let mut draft = Entry::draft("2026-11-22", Slot::Morning);
    draft.document = document("Synthetic partial draft.");
    draft.mood = Some(4);
    let mut current = journal.save(draft).unwrap();
    let original = current.clone();
    for depth in [Depth::Quick, Depth::Deep, Depth::Daily] {
        current.depth = depth;
        current = journal.save(current).unwrap();
        assert_eq!(current.depth, depth);
        assert_eq!(
            (&current.id, &current.date, current.slot),
            (&original.id, &original.date, original.slot)
        );
        assert_eq!(
            (&current.document, current.mood, current.energy),
            (&original.document, Some(4), None)
        );
    }
    assert_eq!(journal.list().unwrap().len(), 1);
}

/// daily-check-in — User-owned small wins / Promote an existing reflection.
#[test]
fn promoted_pride_counts_once_and_wins_stay_user_owned() {
    let (_directory, journal) = temporary_journal();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.reflection.proud_of = "Synthetic: finished a small repair.".into();
    entry.promote_pride();
    entry.promote_pride();
    let mut quiet = Win::manual("Synthetic: called a friend.");
    quiet.include_in_insights = false;
    entry.wins.push(quiet);
    entry.wins.push(Win::manual("Synthetic: cooked dinner."));
    let saved = journal.save(entry).unwrap();
    let stored = journal.get(&saved.id).unwrap();
    assert_eq!(stored.wins.len(), 3);
    let promoted: Vec<_> = stored
        .wins
        .iter()
        .filter(|win| win.origin == "pride")
        .collect();
    assert_eq!(promoted.len(), 1);
    assert_eq!(promoted[0].text, stored.reflection.proud_of);
    assert_eq!(
        stored
            .wins
            .iter()
            .filter(|win| !win.include_in_insights)
            .count(),
        1
    );

    let mut second_promotion = stored.clone();
    let mut copy = Win::manual("Synthetic: finished a small repair.");
    copy.origin = "pride".into();
    second_promotion.wins.push(copy);
    assert_eq!(journal.save(second_promotion), Err(Error::Reflection));
    let mut duplicate_id = stored.clone();
    duplicate_id.wins.push(stored.wins[1].clone());
    assert_eq!(journal.save(duplicate_id), Err(Error::Reflection));
    assert_eq!(journal.get(&saved.id).unwrap(), stored);
}

/// daily-check-in — Optional perceived progress / Progress skipped, Independent assessments.
#[test]
fn progress_is_optional_and_independent_of_completion_and_other_scores() {
    let (_directory, journal) = temporary_journal();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.document = document("Synthetic: a heavy day with some progress.");
    (entry.mood, entry.energy) = (Some(1), Some(3));
    entry.complete = true;
    let completed = journal.save(entry).unwrap();
    assert!(completed.complete);
    assert_eq!(completed.progress, None);
    let mut assessed = completed;
    (assessed.pride, assessed.progress) = (Some(9), Some(9));
    let assessed = journal.save(assessed).unwrap();
    assert_eq!(
        (
            assessed.mood,
            assessed.energy,
            assessed.pride,
            assessed.progress,
            assessed.complete
        ),
        (Some(1), Some(3), Some(9), Some(9), true)
    );
}

/// local-data-protection — Thirty-day recoverable trash / Occupied restore slot, Accidental deletion.
#[test]
fn occupied_restore_reports_a_conflict_without_overwriting_or_purging() {
    let (_directory, journal) = temporary_journal();
    let mut entry = Entry::draft("2026-11-22", Slot::Morning);
    entry.document = document("Synthetic entry that is deleted by mistake.");
    (entry.mood, entry.energy, entry.progress) = (Some(5), Some(6), Some(4));
    entry.reflection.helped = "Synthetic help.".into();
    let entry = journal.save(entry).unwrap();
    journal.trash(&entry.id, entry.revision, NOW).unwrap();
    let mut replacement = Entry::draft("2026-11-22", Slot::Morning);
    replacement.document = document("Synthetic replacement.");
    let replacement = journal.save(replacement).unwrap();

    assert_eq!(journal.restore(&entry.id), Err(Error::Occupied));
    assert_eq!(journal.get(&replacement.id).unwrap(), replacement);
    let trash = journal.trash_items().unwrap();
    assert_eq!(trash.len(), 1);
    assert_eq!(trash[0].entry, entry);
    assert_eq!(
        (trash[0].deleted_at, trash[0].expires_at),
        (NOW, NOW + 30 * DAY)
    );

    journal
        .trash(&replacement.id, replacement.revision, NOW + 60)
        .unwrap();
    let restored = journal.restore(&entry.id).unwrap();
    assert_eq!(restored.revision, entry.revision + 1);
    assert_eq!(
        Entry {
            revision: entry.revision,
            ..restored.clone()
        },
        entry
    );
    assert_eq!(journal.get(&entry.id).unwrap(), restored);
    assert_eq!(journal.trash_items().unwrap()[0].entry, replacement);
}

/// local-data-protection — Thirty-day recoverable trash (precise lifecycle errors).
#[test]
fn trash_operations_distinguish_stale_revisions_from_missing_entries() {
    let (_directory, journal) = temporary_journal();
    let first = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let mut second = first.clone();
    second.mood = Some(5);
    let second = journal.save(second).unwrap();
    assert_eq!(
        journal.trash(&first.id, first.revision, NOW),
        Err(Error::Conflict)
    );
    assert_eq!(journal.get(&second.id).unwrap(), second);
    assert_eq!(journal.permanently_delete(&second.id), Err(Error::NotFound));
    journal.trash(&second.id, second.revision, NOW).unwrap();
    assert_eq!(
        journal.trash(&second.id, second.revision, NOW),
        Err(Error::NotFound)
    );
    assert_eq!(
        journal.trash("00000000-0000-4000-8000-000000000000", 1, NOW),
        Err(Error::NotFound)
    );
    assert_eq!(journal.save(second.clone()), Err(Error::NotFound));
    journal.permanently_delete(&second.id).unwrap();
    assert_eq!(journal.permanently_delete(&second.id), Err(Error::NotFound));
    assert!(journal.trash_items().unwrap().is_empty());
}

/// local-data-protection — Thirty-day recoverable trash / Explicit permanent deletion.
#[test]
fn permanent_deletion_removes_the_entry_text_from_the_live_database_file() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let marker = b"Synthetic marker 7f3a: a fictional private sentence";
    let journal = Journal::open(&path).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Morning);
    entry.document = document(std::str::from_utf8(marker).unwrap());
    let entry = journal.save(entry).unwrap();
    journal
        .save(Entry::draft("2026-11-22", Slot::Evening))
        .unwrap();
    drop(journal);
    assert!(
        contains(&std::fs::read(&path).unwrap(), marker),
        "the marker reaches the file first"
    );

    let journal = Journal::open(&path).unwrap();
    journal.trash(&entry.id, entry.revision, NOW).unwrap();
    journal.permanently_delete(&entry.id).unwrap();
    assert_eq!(journal.restore(&entry.id), Err(Error::NotFound));
    drop(journal);
    for file in std::fs::read_dir(directory.path()).unwrap() {
        let file = file.unwrap().path();
        assert!(
            !contains(&std::fs::read(&file).unwrap(), marker),
            "{}",
            file.display()
        );
    }
}

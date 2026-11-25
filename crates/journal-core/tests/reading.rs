#![allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]

mod common;

use common::files_containing;
use journal_core::{Action, Entry, Journal, Milestone, SearchRequest, Slot, Win};
use serde_json::json;

#[test]
fn local_search_combines_filters_and_never_returns_edited_or_trashed_text() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    // Deliberate multilingual synthetic search fixture.
    morning.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic journée paisible 🌿"}]}]});
    let saved = journal.save(morning).unwrap();
    let request = SearchRequest {
        text: "journee".into(),
        slot: Some(Slot::Morning),
        ..Default::default()
    };
    assert_eq!(journal.search(&request).unwrap().len(), 1);
    assert_eq!(journal.search(&request).unwrap()[0].id, saved.id);
    let mut edited = saved;
    edited.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic evening clouds."}]}]});
    let edited = journal.save(edited).unwrap();
    assert!(journal.search(&request).unwrap().is_empty());
    let clouds = SearchRequest {
        text: "clouds".into(),
        ..Default::default()
    };
    assert_eq!(journal.search(&clouds).unwrap().len(), 1);
    journal
        .trash(&edited.id, edited.revision, 1_795_363_200)
        .unwrap();
    assert!(journal.search(&clouds).unwrap().is_empty());
}

/// Ids of the entries a plain text search returns.
fn search_ids(journal: &Journal, text: &str) -> Vec<String> {
    let request = SearchRequest {
        text: text.into(),
        ..Default::default()
    };
    journal
        .search(&request)
        .unwrap()
        .into_iter()
        .map(|entry| entry.id)
        .collect()
}

#[test]
fn search_ignores_punctuation_and_emoji_beside_words_but_still_requires_every_word() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    // Deliberate multilingual synthetic search fixture.
    morning.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic journée paisible 🌿"}]}]});
    let saved = journal.save(morning).unwrap();
    // French typography puts a space before "?"; the tokenizer indexes no word for "?", "«" or "🌿".
    for text in ["journee ?", "paisible 🌿", "« journee »"] {
        assert_eq!(search_ids(&journal, text), [saved.id.as_str()], "{text}");
    }
    assert!(search_ids(&journal, "journee ? absent").is_empty());
    assert!(search_ids(&journal, "?").is_empty());
    let report = journal
        .reading_report(&SearchRequest {
            text: "paisible 🌿".into(),
            from: Some("2026-11-22".into()),
            to: Some("2026-11-22".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!((report.entries, report.recorded_days), (1, 1));
    assert_eq!(report.days[0].observations[0].id, saved.id);
}

#[test]
fn search_keeps_the_words_of_each_query_part_together_and_folds_only_latin_accents() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    // Deliberate multilingual synthetic search fixtures; the browser preview mirrors these rules.
    let mut together = Entry::draft("2026-11-21", Slot::Morning);
    together.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic l’amour du matin, καλημέρα"}]}]});
    let together = journal.save(together).unwrap();
    let mut apart = Entry::draft("2026-11-22", Slot::Morning);
    apart.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic amour de l'été"}]}]});
    let apart = journal.save(apart).unwrap();
    assert_eq!(search_ids(&journal, "l'amour"), [together.id.as_str()]);
    assert_eq!(search_ids(&journal, "ete amour"), [apart.id.as_str()]);
    assert_eq!(search_ids(&journal, "ΚΑΛΗΜΈΡΑ"), [together.id.as_str()]);
    assert!(search_ids(&journal, "καλημερα").is_empty());
}

#[test]
fn weekly_notes_and_milestones_survive_restart_and_source_changes_invalidate_summaries() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let entry = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let review = journal.weekly_review("2026-11-22").unwrap();
    assert_eq!(
        (review.week_start.as_str(), review.week_end.as_str()),
        ("2026-11-16", "2026-11-22")
    );
    let review = journal
        .save_weekly_notes(&review.week_start, "Synthetic notes to keep.", 0)
        .unwrap();
    let summary = journal
        .generate_weekly_summary(&review.week_start, review.revision)
        .unwrap();
    assert!(summary.summary.is_some());
    let milestone = journal_core::Milestone::new("2026-11-22", "Synthetic milestone");
    let milestone = journal.save_milestone(milestone).unwrap();
    let backup = journal
        .backup_to(
            directory.path(),
            "synthetic reading backup passphrase",
            1_795_363_200,
        )
        .unwrap();
    let mut restored = Journal::open(&directory.path().join("restored.sqlite")).unwrap();
    restored
        .restore_from(&backup.path, "synthetic reading backup passphrase")
        .unwrap();
    assert_eq!(
        restored.weekly_review("2026-11-22").unwrap().notes,
        "Synthetic notes to keep."
    );
    assert_eq!(restored.milestones().unwrap(), vec![milestone.clone()]);
    let mut edited = entry;
    edited.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic revised weekly source."}]}]});
    let edited = journal.save(edited).unwrap();
    let stale_after_edit = journal.weekly_review("2026-11-22").unwrap();
    assert!(stale_after_edit.stale);
    assert_eq!(stale_after_edit.summary, None);
    assert_eq!(stale_after_edit.notes, "Synthetic notes to keep.");
    journal
        .generate_weekly_summary(&stale_after_edit.week_start, stale_after_edit.revision)
        .unwrap();
    journal
        .trash(&edited.id, edited.revision, 1_795_363_200)
        .unwrap();
    let stale = journal.weekly_review("2026-11-22").unwrap();
    assert!(stale.stale);
    assert_eq!(stale.summary, None);
    assert_eq!(stale.notes, "Synthetic notes to keep.");
    drop(journal);
    let journal = Journal::open(&path).unwrap();
    assert_eq!(journal.milestones().unwrap(), vec![milestone.clone()]);
    assert_eq!(
        journal.weekly_review("2026-11-22").unwrap().notes,
        "Synthetic notes to keep."
    );
    journal.clear_reading_summaries().unwrap();
    assert_eq!(
        journal.weekly_review("2026-11-22").unwrap().notes,
        "Synthetic notes to keep."
    );
    journal
        .delete_milestone(&milestone.id, milestone.revision)
        .unwrap();
    assert!(journal.milestones().unwrap().is_empty());
}

/// personal-timeline — User-owned milestones / Deleted milestone text leaves the live journal
/// files: the title and notes leave the database file and its write-ahead log as soon as the
/// deletion returns, while the journal stays open.
#[test]
fn deleting_a_milestone_removes_its_title_and_notes_from_the_open_journal_files() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let title = "Synthetic milestone 3a6f";
    let notes = "Synthetic marker 3a6f: fictional private milestone notes";
    let journal = Journal::open(&path).unwrap();
    let mut milestone = Milestone::new("2026-11-20", title);
    milestone.notes = notes.into();
    let milestone = journal.save_milestone(milestone).unwrap();
    let kept = journal
        .save_milestone(Milestone::new("2026-11-22", "Synthetic milestone kept"))
        .unwrap();
    drop(journal);
    for marker in [title, notes] {
        assert_eq!(
            files_containing(directory.path(), marker.as_bytes()),
            ["journal.sqlite"],
            "{marker} reaches the file first"
        );
    }

    let journal = Journal::open(&path).unwrap();
    journal
        .delete_milestone(&milestone.id, milestone.revision)
        .unwrap();
    assert_eq!(journal.milestones().unwrap(), vec![kept]);
    for marker in [title, notes] {
        assert!(
            files_containing(directory.path(), marker.as_bytes()).is_empty(),
            "{marker}"
        );
    }
}

#[test]
fn reports_keep_slots_gaps_scored_drafts_and_per_metric_denominators() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    morning.mood = Some(2);
    morning.energy = Some(3);
    morning.progress = Some(9);
    let morning = journal.save(morning).unwrap();
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.mood = Some(7);
    evening.energy = Some(6);
    journal.save(evening).unwrap();
    let request = SearchRequest {
        from: Some("2026-11-21".into()),
        to: Some("2026-11-23".into()),
        ..Default::default()
    };
    let report = journal.reading_report(&request).unwrap();
    assert_eq!(
        (report.recorded_days, report.entries, report.calendar_days),
        (1, 2, 3)
    );
    assert_eq!(report.mood.observations, 2);
    assert_eq!(report.mood.mean, Some(4.5));
    assert_eq!(report.pride.observations, 0);
    assert_eq!(report.progress.mean, Some(9.0));
    assert_eq!(report.days[1].observations.len(), 2);
    assert!(report.days[0].observations.is_empty());
    let mut hidden = morning;
    hidden.include_in_insights = false;
    journal.save(hidden).unwrap();
    let hidden = journal.reading_report(&request).unwrap();
    assert_eq!(hidden.mood.mean, Some(7.0));
    assert_eq!(hidden.progress.observations, 0);
}

#[test]
fn weekly_counts_use_distinct_dates_and_do_not_count_authored_notes_or_pride_twice() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut morning = Entry::draft("2026-11-20", Slot::Morning);
    morning.mood = Some(2);
    morning.energy = Some(3);
    morning.pride = Some(9);
    morning.reflection.proud_of = "Synthetic: made room for rest.".into();
    morning.actions.push(Action {
        id: "synthetic-rest".into(),
        text: "Synthetic rest".into(),
        category: "rest".into(),
    });
    morning.promote_pride();
    morning.promote_pride();
    journal.save(morning).unwrap();
    let mut evening = Entry::draft("2026-11-20", Slot::Evening);
    evening.mood = Some(7);
    evening.progress = Some(8);
    journal.save(evening).unwrap();
    let mut sunday = Entry::draft("2026-11-22", Slot::Morning);
    sunday.mood = Some(6);
    sunday.energy = Some(9);
    journal.save(sunday).unwrap();
    journal
        .save(Entry::draft("2026-11-23", Slot::Morning))
        .unwrap();

    let review = journal.weekly_review("2026-11-22").unwrap();
    assert_eq!(review.week_start, "2026-11-16");
    assert_eq!(review.week_end, "2026-11-22");
    assert_eq!((review.report.entries, review.report.recorded_days), (3, 2));
    assert_eq!(review.report.calendar_days, 7);
    assert_eq!((review.report.wins, review.report.actions), (1, 1));
    assert_eq!(
        (review.report.mood.mean, review.report.mood.observations),
        (Some(5.0), 3)
    );
    assert_eq!(
        (review.report.energy.mean, review.report.energy.observations),
        (Some(6.0), 2)
    );
    assert_eq!(review.report.pride.observations, 1);
    assert_eq!(review.report.progress.observations, 1);
    assert_eq!(review.report.mood.recorded_days, 2);
    assert_eq!(review.report.energy.recorded_days, 2);
    assert_eq!(review.report.pride.recorded_days, 1);
    assert_eq!(review.report.progress.recorded_days, 1);
    let notes = journal
        .save_weekly_notes(
            &review.week_start,
            "Synthetic authored weekly reflection.",
            0,
        )
        .unwrap();
    assert_eq!((notes.report.entries, notes.report.recorded_days), (3, 2));
    let summary = journal
        .generate_weekly_summary(&notes.week_start, notes.revision)
        .unwrap();
    assert!(
        summary
            .summary
            .unwrap()
            .contains("1 approved small win and 1 reported action.")
    );
    assert_eq!(summary.notes, "Synthetic authored weekly reflection.");
    let empty = journal.weekly_review("2026-11-15").unwrap();
    assert_eq!((empty.report.entries, empty.report.recorded_days), (0, 0));
    assert_eq!(empty.report.mood.mean, None);
    assert_eq!(empty.report.mood.recorded_days, 0);
}

#[test]
fn insight_win_filters_use_only_included_wins_while_original_search_keeps_owned_records() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut morning = Entry::draft("2026-11-22", Slot::Morning);
    morning.mood = Some(8);
    let mut private_win = Win::manual("Synthetic excluded win.");
    private_win.include_in_insights = false;
    morning.wins.push(private_win);
    let morning = journal.save(morning).unwrap();
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.mood = Some(2);
    evening.wins.push(Win::manual("Synthetic included win."));
    let evening = journal.save(evening).unwrap();
    let mut request = SearchRequest {
        from: Some("2026-11-22".into()),
        to: Some("2026-11-22".into()),
        has_win: Some(true),
        ..Default::default()
    };
    let report = journal.reading_report(&request).unwrap();
    assert_eq!((report.entries, report.wins), (1, 1));
    assert_eq!(report.mood.mean, Some(2.0));
    assert_eq!(report.days[0].observations[0].id, evening.id);
    assert_eq!(journal.search(&request).unwrap().len(), 2);
    request.has_win = Some(false);
    let without_included_win = journal.reading_report(&request).unwrap();
    assert_eq!(
        (without_included_win.entries, without_included_win.wins),
        (1, 0)
    );
    assert_eq!(without_included_win.mood.mean, Some(8.0));
    assert_eq!(without_included_win.days[0].observations[0].id, morning.id);
    assert!(journal.search(&request).unwrap().is_empty());
}

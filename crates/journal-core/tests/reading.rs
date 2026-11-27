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

/// calendar-reading — Local search and filtering / Words in text written without spaces: each
/// Han, kana, Hangul or Thai character is a word of its own, so a query finds the same characters
/// in the same order inside a longer run, and Thai vowel and tone marks still count.
#[test]
fn search_finds_words_inside_chinese_japanese_korean_and_thai_text() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    // Deliberate multilingual synthetic fixtures; the browser preview mirrors these rules.
    let save = |date: &str, text: &str| {
        let mut entry = Entry::draft(date, Slot::Morning);
        entry.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]});
        journal.save(entry).unwrap().id
    };
    let japanese = save(
        "2026-11-18",
        "Synthetic 今日は公園を散歩した。iPhoneで写真を撮った",
    );
    let chinese = save("2026-11-19", "Synthetic 今天我去公园散步了。");
    let thai = save("2026-11-20", "Synthetic วันนี้ฉันไปเดินเล่นที่สวน");
    let korean = save("2026-11-21", "Synthetic 오늘 학교에 갔다.");
    for text in [
        "散歩",
        "公園を散歩",
        "「散歩した」",
        "iphone",
        "iPhoneで写真",
    ] {
        assert_eq!(search_ids(&journal, text), [japanese.as_str()], "{text}");
    }
    assert_eq!(search_ids(&journal, "公园"), [chinese.as_str()]);
    assert_eq!(
        search_ids(&journal, "今"),
        [chinese.as_str(), japanese.as_str()]
    );
    for text in ["เดินเล่น", "ไปเดิน"] {
        assert_eq!(search_ids(&journal, text), [thai.as_str()], "{text}");
    }
    // Hangul is split by syllable, so a noun finds its form with an attached particle.
    for text in ["학교", "학교에", "교에"] {
        assert_eq!(search_ids(&journal, text), [korean.as_str()], "{text}");
    }
    // Characters out of order or apart, or a Thai word without its vowel mark, are not found.
    for text in [
        "歩散",
        "公園散歩",
        "เล่นเดิน",
        "เดน",
        "교학",
        "花火",
        "散歩 OR 公园",
    ] {
        assert!(search_ids(&journal, text).is_empty(), "{text}");
    }
    let report = journal
        .reading_report(&SearchRequest {
            text: "散歩".into(),
            from: Some("2026-11-18".into()),
            to: Some("2026-11-21".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!((report.entries, report.recorded_days), (1, 1));
    assert_eq!(report.days[0].observations[0].id, japanese);
}

/// calendar-reading — Local search and filtering / Whole saved entry: search finds a word written
/// only in a reflection answer, an action, a small win or the person's own emotion word (D-017).
/// Insight reports match a win's text only while that win is included in insights.
#[test]
fn search_finds_words_in_reflection_answers_actions_wins_and_the_own_emotion_word() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    // Deliberate multilingual synthetic fixture; the browser preview mirrors these rules.
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.mood = Some(6);
    evening.document = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic quiet evening."}]}]});
    evening.reflection.intention = "Synthetic lantern".into();
    evening.reflection.proud_of = "Synthetic orchard".into();
    evening.reflection.difficulty = "Synthetic drizzle".into();
    evening.reflection.next_step = "Synthetic kettle".into();
    evening.reflection.helped = "Synthetic long walk along the Seine".into();
    evening.reflection.learned = "Synthetic 公園を散歩した".into();
    evening.actions.push(Action {
        id: "synthetic-pottery".into(),
        text: "Synthetic pottery class".into(),
        category: String::new(),
    });
    evening
        .wins
        .push(Win::manual("Synthetic marathon finished"));
    let mut private_win = Win::manual("Synthetic violin recital");
    private_win.include_in_insights = false;
    evening.wins.push(private_win);
    evening.another_emotion = "sereine".into();
    let evening = journal.save(evening).unwrap();
    for text in [
        "lantern",
        "orchard",
        "drizzle",
        "kettle",
        "walk along the seine",
        "散歩",
        "pottery",
        "marathon",
        "violin",
        "SEREINE",
        "quiet seine marathon",
    ] {
        assert_eq!(search_ids(&journal, text), [evening.id.as_str()], "{text}");
    }
    assert!(search_ids(&journal, "seine absent").is_empty());
    let report = |text: &str| {
        journal
            .reading_report(&SearchRequest {
                text: text.into(),
                from: Some("2026-11-22".into()),
                to: Some("2026-11-22".into()),
                ..Default::default()
            })
            .unwrap()
            .entries
    };
    for text in ["seine", "pottery", "marathon", "sereine"] {
        assert_eq!(report(text), 1, "{text}");
    }
    // An excluded win stays out of insights, so its words do not select the entry there.
    assert_eq!(report("violin"), 0);
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
    let summary = journal.generate_weekly_summary(&review.week_start).unwrap();
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
        .generate_weekly_summary(&stale_after_edit.week_start)
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
    let summary = journal.generate_weekly_summary(&notes.week_start).unwrap();
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

/// weekly-reviews — Authorship and source freshness: a local summary leaves the authored notes
/// and their revision alone, so a notes save based on the revision read before it still succeeds.
#[test]
fn summaries_leave_the_notes_revision_to_authored_saves() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let notes = journal
        .save_weekly_notes("2026-11-22", "Synthetic notes.", 0)
        .unwrap();
    let summary = journal.generate_weekly_summary("2026-11-22").unwrap();
    assert!(summary.summary.is_some());
    assert_eq!(
        (summary.notes.as_str(), summary.revision),
        ("Synthetic notes.", 1)
    );
    let saved = journal
        .save_weekly_notes("2026-11-22", "Synthetic notes. Kept.", notes.revision)
        .unwrap();
    assert_eq!(
        (saved.notes.as_str(), saved.revision),
        ("Synthetic notes. Kept.", 2)
    );
    assert_eq!(saved.summary, summary.summary);
    let regenerated = journal.generate_weekly_summary("2026-11-16").unwrap();
    assert_eq!(
        (regenerated.notes.as_str(), regenerated.revision),
        ("Synthetic notes. Kept.", 2)
    );
    assert!(matches!(
        journal.save_weekly_notes("2026-11-22", "Synthetic stale text.", notes.revision),
        Err(journal_core::Error::Conflict)
    ));

    // A week without notes is stored at revision 1, as backups accept only positive revisions.
    let empty = journal.generate_weekly_summary("2026-11-09").unwrap();
    assert_eq!((empty.notes.as_str(), empty.revision), ("", 1));
    let again = journal.generate_weekly_summary("2026-11-09").unwrap();
    assert_eq!(again.revision, 1);
    journal
        .backup_to(
            directory.path(),
            "synthetic reading backup passphrase",
            1_795_363_200,
        )
        .unwrap();
}

/// weekly-reviews — Authorship and source freshness: a notes save whose reply cannot be built
/// reports the error with nothing stored, so retrying on the same revision succeeds.
#[test]
fn a_notes_save_that_cannot_build_its_reply_stores_nothing() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let source = journal
        .save(Entry::draft("2026-11-22", Slot::Morning))
        .unwrap();
    let notes = journal
        .save_weekly_notes("2026-11-22", "Synthetic notes.", 0)
        .unwrap();
    let raw = rusqlite::Connection::open(&path).unwrap();
    let payload: String = raw
        .query_row(
            "SELECT payload FROM journal_entries WHERE id=?1",
            [&source.id],
            |row| row.get(0),
        )
        .unwrap();
    // The week's source becomes unreadable, so the reply fails after the notes are written.
    raw.execute(
        "UPDATE journal_entries SET payload='{}' WHERE id=?1",
        [&source.id],
    )
    .unwrap();
    assert!(
        journal
            .save_weekly_notes("2026-11-22", "Synthetic notes. Kept.", notes.revision)
            .is_err()
    );
    raw.execute(
        "UPDATE journal_entries SET payload=?1 WHERE id=?2",
        [&payload, &source.id],
    )
    .unwrap();
    let stored = journal.weekly_review("2026-11-22").unwrap();
    assert_eq!(
        (stored.notes.as_str(), stored.revision),
        ("Synthetic notes.", 1)
    );
    let retried = journal
        .save_weekly_notes("2026-11-22", "Synthetic notes. Kept.", notes.revision)
        .unwrap();
    assert_eq!(
        (retried.notes.as_str(), retried.revision),
        ("Synthetic notes. Kept.", 2)
    );
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

/// calendar-reading — Local search and filtering / Formatted part of a word: a word with a bold
/// part is indexed whole, so search finds it by the whole word and not by its bold part alone.
#[test]
fn search_finds_a_partly_formatted_word_by_the_whole_word_only() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut evening = Entry::draft("2026-11-22", Slot::Evening);
    evening.document = json!({"type":"doc","content":[{"type":"paragraph","content":[
        {"type":"text","text":"Synthetic peaceful "},
        {"type":"text","marks":[{"type":"bold"}],"text":"after"},
        {"type":"text","text":"noon by the canal."}
    ]}]});
    let saved = journal.save(evening).unwrap();
    let search = |text: &str| {
        journal
            .search(&SearchRequest {
                text: text.into(),
                ..Default::default()
            })
            .unwrap()
    };
    for text in ["afternoon", "peaceful afternoon"] {
        assert_eq!(search(text), std::slice::from_ref(&saved), "{text}");
    }
    for text in ["after", "noon"] {
        assert!(search(text).is_empty(), "{text}");
    }
}

/// weekly-reviews — Local weekly reflection / Week that ends in year 10000: the ISO week of
/// Monday 27 December 9999 ends on Sunday 2 January 10000, written `+10000-01-02`. Dates are
/// compared as dates, not as text, so that week reports, searches and keeps notes like any other.
#[test]
fn the_week_that_ends_in_year_10000_reports_its_entries_and_keeps_notes() {
    let directory = tempfile::tempdir().unwrap();
    let journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut friday = Entry::draft("9999-12-31", Slot::Evening);
    friday.mood = Some(6);
    let friday = journal.save(friday).unwrap();

    let review = journal.weekly_review("9999-12-31").unwrap();
    assert_eq!(
        (review.week_start.as_str(), review.week_end.as_str()),
        ("9999-12-27", "+10000-01-02")
    );
    let report = &review.report;
    assert_eq!(
        (report.calendar_days, report.entries, report.recorded_days),
        (7, 1, 1)
    );
    assert_eq!(report.mood.mean, Some(6.0));
    assert_eq!(report.days[4].date, "9999-12-31");
    assert_eq!(report.days[4].observations[0].id, friday.id);
    assert_eq!(report.days[6].date, "+10000-01-02");
    let sources = journal
        .search(&SearchRequest {
            from: Some(review.week_start.clone()),
            to: Some(review.week_end.clone()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0].id, friday.id);

    let notes = journal
        .save_weekly_notes("9999-12-31", "Synthetic notes for the last week.", 0)
        .unwrap();
    assert_eq!(
        (notes.revision, notes.notes.as_str()),
        (1, "Synthetic notes for the last week.")
    );
    let summary = journal.generate_weekly_summary(&notes.week_start).unwrap();
    assert!(summary.summary.is_some());
    assert_eq!(
        journal.weekly_review("9999-12-27").unwrap().notes,
        "Synthetic notes for the last week."
    );
}

/// weekly-reviews — Authorship and source freshness / Failed notes save: a notes save checks its
/// whole week before committing. When the week would end after the last date the journal can
/// represent, the save is refused and stores nothing, rather than committing and then reporting a
/// date error that a retry on the same revision would turn into a conflict.
#[test]
fn a_notes_save_for_a_week_without_a_last_day_stores_nothing() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    // The last representable date is a Monday, so its week has no Sunday.
    let last = chrono::NaiveDate::MAX;
    assert_eq!(chrono::Datelike::weekday(&last), chrono::Weekday::Mon);
    let date = last.to_string();
    assert_eq!(
        journal
            .save_weekly_notes(&date, "Synthetic notes.", 0)
            .unwrap_err(),
        journal_core::Error::Date
    );
    let stored: i64 = rusqlite::Connection::open(&path)
        .unwrap()
        .query_row("SELECT COUNT(*) FROM weekly_reviews", [], |row| row.get(0))
        .unwrap();
    assert_eq!(stored, 0);
}

/// weekly-reviews — Authorship and source freshness / Failed notes save: a notes save that fails
/// while it reads its week back, here because a synthetic record no longer reads as an entry, is
/// rolled back. Nothing is stored, and once the record is gone a retry on the same revision saves
/// the notes instead of meeting a conflict.
#[test]
fn a_notes_save_that_cannot_read_its_week_back_stores_nothing_and_can_be_retried() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let outside = rusqlite::Connection::open(&path).unwrap();
    outside
        .execute(
            "INSERT INTO journal_entries(id,entry_date,slot,revision,payload)
             VALUES('synthetic-unreadable','2026-11-25','morning',1,'{\"synthetic\":true}')",
            [],
        )
        .unwrap();
    assert_eq!(
        journal
            .save_weekly_notes("2026-11-25", "Synthetic notes.", 0)
            .unwrap_err(),
        journal_core::Error::Document
    );
    let stored: i64 = outside
        .query_row("SELECT COUNT(*) FROM weekly_reviews", [], |row| row.get(0))
        .unwrap();
    assert_eq!(stored, 0);

    outside
        .execute(
            "DELETE FROM journal_entries WHERE id='synthetic-unreadable'",
            [],
        )
        .unwrap();
    let saved = journal
        .save_weekly_notes("2026-11-25", "Synthetic notes.", 0)
        .unwrap();
    assert_eq!(
        (
            saved.week_start.as_str(),
            saved.revision,
            saved.notes.as_str()
        ),
        ("2026-11-23", 1, "Synthetic notes.")
    );
}

/// progress-insights / personal-timeline: a 100-year report over ten years of Morning and Evening
/// entries places each observation on its own date, Morning first. Entries are grouped by date
/// once rather than scanned again for each of the 36,525 days: scanning made about 267 million
/// date comparisons and took about 2 s in a debug build, grouping about 0.1 s. The 1 s bound
/// leaves room for slower machines.
#[test]
fn a_century_report_over_ten_years_of_entries_groups_observations_by_date() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    drop(Journal::open(&path).unwrap());
    // Saving entries one at a time flushes each commit to disk; one synthetic transaction is quicker.
    let mut expected = std::collections::HashMap::new();
    let mut connection = rusqlite::Connection::open(&path).unwrap();
    let transaction = connection.transaction().unwrap();
    let first = chrono::NaiveDate::from_ymd_opt(2016, 11, 23).unwrap();
    for offset in 0..3_652 {
        let date = (first + chrono::Days::new(offset)).to_string();
        let mut ids = Vec::new();
        for (slot, name, mood) in [(Slot::Morning, "morning", 3), (Slot::Evening, "evening", 7)] {
            let mut entry = Entry::draft(&date, slot);
            entry.mood = Some(mood);
            entry.revision = 1;
            transaction
                .execute(
                    "INSERT INTO journal_entries(id,entry_date,slot,revision,payload) VALUES(?1,?2,?3,1,?4)",
                    rusqlite::params![entry.id, date, name, serde_json::to_string(&entry).unwrap()],
                )
                .unwrap();
            ids.push((entry.id, slot));
        }
        expected.insert(date, ids);
    }
    transaction.commit().unwrap();
    drop(connection);

    let journal = Journal::open(&path).unwrap();
    let request = SearchRequest {
        from: Some("1926-11-23".into()),
        to: Some("2026-11-22".into()),
        ..Default::default()
    };
    let started = std::time::Instant::now();
    let report = journal.reading_report(&request).unwrap();
    let elapsed = started.elapsed();
    assert_eq!(
        (report.calendar_days, report.entries, report.recorded_days),
        (36_525, 7_304, 3_652)
    );
    assert_eq!(report.mood.mean, Some(5.0));
    let mut recorded = 0;
    for day in &report.days {
        let observed: Vec<_> = day
            .observations
            .iter()
            .map(|observation| (observation.id.clone(), observation.slot))
            .collect();
        match expected.get(&day.date) {
            Some(ids) => {
                assert_eq!(&observed, ids, "{}", day.date);
                recorded += 1;
            }
            None => assert!(observed.is_empty(), "{}", day.date),
        }
    }
    assert_eq!(recorded, 3_652);
    assert!(
        elapsed < std::time::Duration::from_secs(1),
        "a century report took {elapsed:?}"
    );
}

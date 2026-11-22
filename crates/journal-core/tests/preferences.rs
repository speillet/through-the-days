#![allow(clippy::unwrap_used, clippy::expect_used)]

use journal_core::{Depth, Entry, Error, Journal, Preferences, Slot};

/// journal-entries — Chosen civil date / Travel; product-guardrails — Gentle view preferences.
#[test]
fn time_zone_changes_only_new_defaults_and_gentle_view_preserves_preferences() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let saved = journal
        .save(Entry::draft("2026-03-29", Slot::Evening))
        .unwrap();
    let instant = "2026-03-29T23:30:00Z".parse().unwrap();
    let mut preferences = Preferences::default();
    assert_eq!(preferences.journal_date(instant).unwrap(), "2026-03-30");
    preferences.time_zone = "America/New_York".into();
    preferences.gentle = true;
    preferences.show_durations = false;
    preferences.theme = "dark".into();
    journal.set_preferences(&preferences).unwrap();
    drop(journal);
    let journal = Journal::open(&path).unwrap();
    let restored = journal.preferences().unwrap();
    assert_eq!(restored, preferences);
    assert_eq!(restored.journal_date(instant).unwrap(), "2026-03-29");
    assert_eq!(journal.get(&saved.id).unwrap().date, "2026-03-29");
    let mut invalid = preferences;
    invalid.time_zone = "Not/AZone".into();
    assert!(journal.set_preferences(&invalid).is_err());
}

/// Preferences stored before reduced motion, default depth and word count existed still load.
#[test]
fn preferences_stored_before_the_newer_display_options_still_load() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    assert_eq!(journal.preferences().unwrap(), Preferences::default());
    let defaults = Preferences::default();
    assert_eq!(
        (
            defaults.reduce_motion,
            defaults.default_depth,
            defaults.show_word_count
        ),
        (false, Depth::Daily, false)
    );
    drop(journal);
    rusqlite::Connection::open(&path)
        .unwrap()
        .execute(
            "INSERT INTO preferences(key,value) VALUES('display',?1)",
            [r#"{"timeZone":"Europe/London","theme":"light","gentle":true,"showDurations":false,"showToolbar":true,"showScores":false,"sidebarOpen":false}"#],
        )
        .unwrap();
    let journal = Journal::open(&path).unwrap();
    let mut stored = journal.preferences().unwrap();
    assert_eq!(
        stored,
        Preferences {
            time_zone: "Europe/London".into(),
            theme: "light".into(),
            gentle: true,
            show_durations: false,
            show_scores: false,
            sidebar_open: false,
            ..Preferences::default()
        }
    );
    stored.reduce_motion = true;
    stored.default_depth = Depth::Quick;
    stored.show_word_count = true;
    journal.set_preferences(&stored).unwrap();
    drop(journal);
    assert_eq!(Journal::open(&path).unwrap().preferences().unwrap(), stored);
}

/// Unknown preference fields are rejected rather than silently dropped.
#[test]
fn unknown_preference_fields_and_themes_are_rejected() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let unknown_theme = Preferences {
        theme: "sepia".into(),
        ..Preferences::default()
    };
    assert_eq!(
        journal.set_preferences(&unknown_theme),
        Err(Error::Document)
    );
    assert_eq!(journal.preferences().unwrap(), Preferences::default());
    drop(journal);
    rusqlite::Connection::open(&path)
        .unwrap()
        .execute(
            "INSERT INTO preferences(key,value) VALUES('display','{\"unknownField\":true}')",
            [],
        )
        .unwrap();
    assert_eq!(
        Journal::open(&path).unwrap().preferences(),
        Err(Error::Document)
    );
}

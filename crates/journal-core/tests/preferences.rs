use journal_core::{Entry, Journal, Preferences, Slot};

#[test]
fn time_zone_changes_only_new_defaults_and_gentle_view_preserves_preferences() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("journal.sqlite");
    let journal = Journal::open(&path).unwrap();
    let saved = journal.save(Entry::draft("2026-03-29", Slot::Evening)).unwrap();
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
